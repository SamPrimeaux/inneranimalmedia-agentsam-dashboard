import React, { useState } from 'react';
import { FolderOpen, File as FileIcon, ChevronRight, ChevronDown, Folder, HardDrive, Cloud, Github, Box } from 'lucide-react';

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
}> = ({ onFileSelect, onWorkspaceRootChange }) => {
    const [rootDir, setRootDir] = useState<FileNode | null>(null);
    const [expandedSections, setExpandedSections] = useState({
        local: true,
        r2: true,
        github: false,
        drive: false
    });

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
                    <div className="px-10 py-3 text-[11px] text-[var(--text-muted)] flex flex-col gap-2 font-mono">
                        <div className="flex items-center gap-2 hover:text-white cursor-pointer"><Box size={13} className="text-[var(--solar-blue)]"/> cad_storage</div>
                        <div className="flex items-center gap-2 hover:text-white cursor-pointer"><Box size={13} className="text-[var(--solar-blue)]"/> platform_assets</div>
                        <div className="flex items-center gap-2 hover:text-white cursor-pointer"><ChevronRight size={13} className="opacity-50"/> splineicons</div>
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

import React, { useMemo, useState } from 'react';
import {
  FolderOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Clock,
  GitBranch,
  Cloud,
  HardDrive,
  Layers,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import type { IdeWorkspaceSnapshot, RecentFileEntry } from '../src/ideWorkspace';
import { diffLineStats } from '../src/ideWorkspace';

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function sourceIcon(source: RecentFileEntry['source']) {
  switch (source) {
    case 'github':
      return <GitBranch size={12} className="text-[var(--solar-cyan)] shrink-0" />;
    case 'r2':
      return <Cloud size={12} className="text-[var(--solar-blue)] shrink-0" />;
    case 'drive':
      return <HardDrive size={12} className="text-[var(--solar-green)] shrink-0" />;
    case 'local':
      return <FolderOpen size={12} className="text-[var(--solar-yellow)] shrink-0" />;
    default:
      return <FileText size={12} className="text-[var(--text-muted)] shrink-0" />;
  }
}

export const WorkspaceExplorerPanel: React.FC<{
  ideWorkspace: IdeWorkspaceSnapshot;
  workspaceTitle: string;
  recentFiles: RecentFileEntry[];
  onRefreshRecent: () => void;
  onClearRecentFiles: () => void;
  onOpenRecent: (entry: RecentFileEntry) => void | Promise<void>;
  onOpenLocalFolder: () => void;
  onOpenFilesActivity: () => void;
  onOpenGitHubActivity: () => void;
}> = ({
  ideWorkspace,
  workspaceTitle,
  recentFiles,
  onRefreshRecent,
  onClearRecentFiles,
  onOpenRecent,
  onOpenLocalFolder,
  onOpenFilesActivity,
  onOpenGitHubActivity,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const workspaceLine = useMemo(() => {
    if (ideWorkspace.source === 'none') return 'No folder or pinned workspace yet.';
    if (ideWorkspace.source === 'local') return `Local: ${ideWorkspace.folderName}`;
    return `${ideWorkspace.name} — ${ideWorkspace.pathHint}`;
  }, [ideWorkspace]);

  return (
    <div className="w-full h-full bg-[var(--bg-panel)] flex flex-col text-[var(--text-main)] overflow-hidden min-h-0">
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] shrink-0">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-[var(--solar-cyan)] shrink-0" />
          <span className="text-[11px] font-bold tracking-widest uppercase">Workspace</span>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-1 font-mono leading-snug">{workspaceTitle}</p>
      </div>

      <div className="p-3 border-b border-[var(--border-subtle)]/60 shrink-0 space-y-2">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)]/80 p-2.5">
          <p className="text-[11px] text-[var(--text-main)] leading-snug">{workspaceLine}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              onClick={onOpenLocalFolder}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-semibold bg-[var(--solar-cyan)]/15 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/35 hover:bg-[var(--solar-cyan)]/25"
            >
              <FolderOpen size={12} /> Open folder
            </button>
            <button
              type="button"
              onClick={onOpenFilesActivity}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-semibold border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]"
            >
              <FileText size={12} /> Files &amp; R2
            </button>
            <button
              type="button"
              onClick={onOpenGitHubActivity}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-semibold border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]"
            >
              <GitBranch size={12} /> Repos
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-subtle)]/40 shrink-0">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <Clock size={11} />
          Recent files
          <span className="text-[var(--text-main)]/50 font-mono normal-case">({recentFiles.length})</span>
        </div>
        {recentFiles.length > 0 && (
          <button
            type="button"
            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--solar-orange)] px-1.5 py-0.5 rounded flex items-center gap-1"
            onClick={() => {
              onClearRecentFiles();
            }}
            title="Clear list"
          >
            <Trash2 size={11} /> Clear
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {recentFiles.length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)] px-2 py-6 text-center leading-relaxed">
            Open a file from Files, GitHub, Drive, or R2. It will appear here with a one-line preview and diff summary when
            you have unsaved edits.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {recentFiles.map((entry) => {
              const open = expandedId === entry.id;
              const orig = entry.snapshotOriginal ?? '';
              const work = entry.snapshotWorking ?? '';
              const dirty = orig !== work && orig.length + work.length > 0;
              const stats = dirty ? diffLineStats(orig, work) : { added: 0, removed: 0 };
              return (
                <li
                  key={entry.id}
                  className="rounded-lg border border-[var(--border-subtle)]/50 bg-[var(--bg-app)]/50 overflow-hidden"
                >
                  <div className="flex items-start gap-1 p-2">
                    <button
                      type="button"
                      className="p-0.5 mt-0.5 text-[var(--text-muted)] hover:text-[var(--text-main)] shrink-0"
                      aria-expanded={open}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedId(open ? null : entry.id);
                      }}
                    >
                      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left rounded-md focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--solar-cyan)]/50 px-0.5 -mx-0.5"
                      onClick={() => void onOpenRecent(entry)}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {sourceIcon(entry.source)}
                        <span className="text-[12px] font-semibold truncate">{entry.name}</span>
                        {dirty && (
                          <span className="text-[9px] font-mono px-1 rounded bg-[var(--solar-yellow)]/15 text-[var(--solar-yellow)]">
                            modified
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)] font-mono truncate mt-0.5" title={entry.label}>
                        {entry.label}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]/80 mt-1 line-clamp-2 break-all">
                        {entry.previewOneLine}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="text-[9px] text-[var(--text-muted)] font-mono">{timeAgo(entry.openedAt)}</span>
                        {dirty && (stats.added > 0 || stats.removed > 0) && (
                          <span className="text-[9px] font-mono text-[var(--text-muted)]">
                            <span className="text-[var(--solar-green)]">+{stats.added}</span>{' '}
                            <span className="text-[var(--solar-red)]">-{stats.removed}</span> lines (approx)
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                  {open && (
                    <div className="px-2 pb-2 pt-0 border-t border-[var(--border-subtle)]/30 space-y-2">
                      {dirty && (
                        <div className="grid max-md:grid-cols-1 md:grid-cols-2 gap-2 text-[10px] font-mono">
                          <div className="min-w-0">
                            <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">
                              Saved / original (excerpt)
                            </div>
                            <pre className="max-h-28 overflow-auto p-2 rounded bg-[var(--bg-panel)] border border-[var(--border-subtle)]/50 whitespace-pre-wrap break-all text-[var(--text-muted)]">
                              {orig.slice(0, 4000) || '(none)'}
                            </pre>
                          </div>
                          <div className="min-w-0">
                            <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">
                              Working (excerpt)
                            </div>
                            <pre className="max-h-28 overflow-auto p-2 rounded bg-[var(--bg-panel)] border border-[var(--border-subtle)]/50 whitespace-pre-wrap break-all">
                              {work.slice(0, 4000)}
                            </pre>
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void onOpenRecent(entry)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/40 hover:bg-[var(--solar-cyan)]/30"
                        >
                          <ExternalLink size={12} /> Open in editor
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

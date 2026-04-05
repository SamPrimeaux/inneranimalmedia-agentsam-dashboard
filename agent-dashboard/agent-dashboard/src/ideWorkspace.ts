/**
 * Persisted IDE workspace context — drives the bottom status bar and future Git/terminal wiring.
 * Local folder (File System Access API) overrides a pinned welcome workspace.
 */

import type { ActiveFile } from '../types';

export type IdeWorkspaceSnapshot =
  | { source: 'none' }
  | { source: 'local'; folderName: string }
  | { source: 'pinned'; name: string; pathHint: string };

const WS_KEY = 'meauxcad_ide_workspace';
const BRANCH_KEY = 'meauxcad_git_branch';
const RECENT_FILES_KEY = 'meauxcad_ide_recent_files';
const MAX_RECENT_FILES = 24;
const SNAPSHOT_CAP = 12000;

export type RecentFileSource = 'local' | 'github' | 'r2' | 'drive' | 'buffer';

/** Persisted recent-opened file metadata + capped snapshots for preview / diff in Workspace explorer. */
export type RecentFileEntry = {
  id: string;
  name: string;
  openedAt: number;
  /** Human-readable path or label */
  label: string;
  source: RecentFileSource;
  previewOneLine: string;
  snapshotOriginal: string | null;
  snapshotWorking: string;
  githubRepo?: string;
  githubPath?: string;
  githubBranch?: string;
  r2Key?: string;
  r2Bucket?: string;
  driveFileId?: string;
  workspacePath?: string;
};

function truncateSnapshot(s: string, max = SNAPSHOT_CAP): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '\n/* … truncated … */';
}

function recentFileId(f: ActiveFile): string {
  if (f.githubRepo && f.githubPath) return `gh:${f.githubRepo}:${f.githubPath}`;
  if (f.r2Bucket && f.r2Key) return `r2:${f.r2Bucket}:${f.r2Key}`;
  if (f.driveFileId) return `gdrive:${f.driveFileId}`;
  if (f.workspacePath) return `local:${f.workspacePath}`;
  return `name:${f.name}`;
}

function recentFileLabel(f: ActiveFile): string {
  if (f.githubRepo && f.githubPath) return `${f.githubRepo}/${f.githubPath}`;
  if (f.r2Bucket && f.r2Key) return `${f.r2Bucket}/${f.r2Key}`;
  if (f.workspacePath) return f.workspacePath;
  return f.name;
}

function recentSource(f: ActiveFile): RecentFileSource {
  if (f.githubRepo) return 'github';
  if (f.r2Key) return 'r2';
  if (f.driveFileId) return 'drive';
  if (f.workspacePath || f.handle) return 'local';
  return 'buffer';
}

function minifyOneLine(s: string, maxLen: number): string {
  const one = s.replace(/\s+/g, ' ').trim();
  if (one.length <= maxLen) return one || '(empty)';
  return one.slice(0, maxLen - 1) + '…';
}

export function loadRecentFiles(): RecentFileEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (x): x is RecentFileEntry =>
        x &&
        typeof x === 'object' &&
        typeof (x as RecentFileEntry).id === 'string' &&
        typeof (x as RecentFileEntry).name === 'string' &&
        typeof (x as RecentFileEntry).openedAt === 'number',
    );
  } catch {
    return [];
  }
}

function saveRecentFiles(entries: RecentFileEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(entries.slice(0, MAX_RECENT_FILES)));
  } catch {
    /* quota */
  }
}

/** Record or refresh a row in recent files (call when the active editor file changes). */
export function pushRecentFromActiveFile(file: ActiveFile): void {
  const id = recentFileId(file);
  const orig =
    file.originalContent !== undefined ? truncateSnapshot(file.originalContent) : null;
  const work = truncateSnapshot(file.content);
  const entry: RecentFileEntry = {
    id,
    name: file.name,
    openedAt: Date.now(),
    label: recentFileLabel(file),
    source: recentSource(file),
    previewOneLine: minifyOneLine(file.content, 160),
    snapshotOriginal: orig,
    snapshotWorking: work,
    githubRepo: file.githubRepo,
    githubPath: file.githubPath,
    githubBranch: file.githubBranch,
    r2Key: file.r2Key,
    r2Bucket: file.r2Bucket,
    driveFileId: file.driveFileId,
    workspacePath: file.workspacePath,
  };
  const prev = loadRecentFiles().filter((e) => e.id !== id);
  saveRecentFiles([entry, ...prev]);
}

export function clearRecentFiles(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(RECENT_FILES_KEY);
}

/** Line-level diff stats for UI badges (no external deps). */
export function diffLineStats(a: string, b: string): { added: number; removed: number } {
  const la = a.split('\n');
  const lb = b.split('\n');
  const setB = new Set(lb);
  const setA = new Set(la);
  let removed = 0;
  for (const line of la) {
    if (!setB.has(line)) removed++;
  }
  let added = 0;
  for (const line of lb) {
    if (!setA.has(line)) added++;
  }
  return { added, removed };
}

function safeParse(raw: string | null): IdeWorkspaceSnapshot | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as IdeWorkspaceSnapshot;
    if (o && (o.source === 'none' || o.source === 'local' || o.source === 'pinned')) return o;
  } catch {
    /* ignore */
  }
  return null;
}

export function loadWorkspace(): IdeWorkspaceSnapshot {
  if (typeof localStorage === 'undefined') return { source: 'none' };
  return safeParse(localStorage.getItem(WS_KEY)) ?? { source: 'none' };
}

export function saveWorkspace(s: IdeWorkspaceSnapshot): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(WS_KEY, JSON.stringify(s));
}

export function loadGitBranch(): string {
  if (typeof localStorage === 'undefined') return 'main';
  return localStorage.getItem(BRANCH_KEY)?.trim() || 'main';
}

export function saveGitBranch(branch: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(BRANCH_KEY, branch.trim() || 'main');
}

export function formatWorkspaceStatusLine(ws: IdeWorkspaceSnapshot): string {
  if (ws.source === 'none') return 'No workspace';
  if (ws.source === 'local') return `${ws.folderName} (local disk)`;
  return `${ws.name} — ${ws.pathHint}`;
}

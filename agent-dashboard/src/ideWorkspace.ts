/**
 * Persisted IDE workspace context — drives the bottom status bar and future Git/terminal wiring.
 * Local folder (File System Access API) overrides a pinned welcome workspace.
 */

export type IdeWorkspaceSnapshot =
  | { source: 'none' }
  | { source: 'local'; folderName: string }
  | { source: 'pinned'; name: string; pathHint: string };

const WS_KEY = 'meauxcad_ide_workspace';
const BRANCH_KEY = 'meauxcad_git_branch';

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

import React, { useState, useEffect } from 'react';
import { 
  FolderOpen, 
  Github, 
  Terminal, 
  Plus, 
  Command, 
  Search, 
  Terminal as TermIcon,
  MessageSquare,
  History,
  ArrowRight,
  Globe,
  Ghost
} from 'lucide-react';
import { useEditor } from '../src/EditorContext';
import type { RecentFileEntry } from '../src/ideWorkspace';

interface WorkspaceDashboardProps {
  onOpenFolder: () => void;
  onConnectWorkspace: () => void;
  onGithubSync: () => void;
  recentFiles: RecentFileEntry[];
}

/**
 * WorkspaceDashboard: A premium, centered 'Cursor-style' home screen for the IDE.
 * Replaces the legacy WelcomeScreen and WorkspaceLauncher modal.
 */
export const WorkspaceDashboard: React.FC<WorkspaceDashboardProps> = ({ 
  onOpenFolder, 
  onConnectWorkspace, 
  onGithubSync,
  recentFiles
}) => {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isSandbox = hostname.includes('sandbox');
  const envLabel = isSandbox ? 'Sandbox Control Plane' : 'Production Build';

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[var(--scene-bg)] overflow-y-auto py-12 px-6 no-scrollbar h-full">
      
      {/* ── Branded Hero ── */}
      <div className="flex flex-col items-center mb-12 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="w-16 h-16 mb-6 rounded-2xl bg-gradient-to-br from-[var(--solar-cyan)] to-[var(--solar-blue)] flex items-center justify-center shadow-[0_0_30px_rgba(45,212,191,0.2)]">
            <Ghost size={36} className="text-black" />
        </div>
        <h1 className="text-3xl font-black text-[var(--text-heading)] uppercase tracking-[0.2em] mb-2">
            INNER ANIMAL MEDIA
        </h1>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--solar-cyan)]/10 border border-[var(--solar-cyan)]/20 text-[10px] font-bold text-[var(--solar-cyan)] uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--solar-cyan)] animate-pulse" />
            {envLabel}
        </div>
      </div>

      {/* ── Primary Action Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mb-12 animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-150">
        <button 
          onClick={onOpenFolder}
          className="group flex flex-col items-start p-6 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl hover:border-[var(--solar-cyan)]/50 transition-all duration-300 hover:shadow-[0_4px_20px_rgba(0,0,0,0.2)]"
        >
          <div className="p-3 rounded-xl bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors mb-4">
            <FolderOpen size={24} />
          </div>
          <h3 className="text-sm font-bold text-[var(--text-main)] mb-1">Open Local Project</h3>
          <p className="text-[11px] text-[var(--text-muted)] text-left">Browse your local filesystem to pick a repository</p>
        </button>

        <button 
          onClick={onConnectWorkspace}
          className="group flex flex-col items-start p-6 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl hover:border-[var(--solar-cyan)]/50 transition-all duration-300 hover:shadow-[0_4px_20px_rgba(0,0,0,0.2)]"
        >
          <div className="p-3 rounded-xl bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors mb-4">
            <Globe size={24} />
          </div>
          <h3 className="text-sm font-bold text-[var(--text-main)] mb-1">Connect Workspace</h3>
          <p className="text-[11px] text-[var(--text-muted)] text-left">Switch to a D1-backed remote control plane</p>
        </button>

        <button 
          onClick={onGithubSync}
          className="group flex flex-col items-start p-6 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl hover:border-[var(--solar-cyan)]/50 transition-all duration-300 hover:shadow-[0_4px_20px_rgba(0,0,0,0.2)]"
        >
          <div className="p-3 rounded-xl bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors mb-4">
            <Github size={24} />
          </div>
          <h3 className="text-sm font-bold text-[var(--text-main)] mb-1">Clone Repository</h3>
          <p className="text-[11px] text-[var(--text-muted)] text-left">Import your projects directly from GitHub</p>
        </button>
      </div>

      {/* ── Recent Projects Registry ── */}
      <div className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
        <div className="flex items-center gap-2 mb-4 px-2">
            <History size={14} className="text-[var(--text-muted)]" />
            <h2 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Recently Opened</h2>
        </div>
        
        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl divide-y divide-[var(--border-subtle)] overflow-hidden shadow-sm">
          {recentFiles.length > 0 ? (
            recentFiles.slice(0, 6).map((file) => (
              <div 
                key={file.id}
                className="group flex items-center justify-between p-4 hover:bg-[var(--bg-app)] transition-colors cursor-pointer"
                onClick={() => { /* Handler wired via App.tsx */ }}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[var(--bg-app)] flex items-center justify-center text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors">
                    <Terminal size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-[var(--text-main)] truncate">{file.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">{file.label}</div>
                  </div>
                </div>
                <ArrowRight size={14} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-all translate-x-[-8px] group-hover:translate-x-0" />
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-[var(--text-muted)] italic text-[12px]">
              No recent projects found. Open a folder to begin.
            </div>
          )}
        </div>
      </div>

      {/* ── IDE Shortcuts Hint ── */}
      <div className="mt-12 flex flex-wrap justify-center gap-8 text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-bold opacity-40 hover:opacity-100 transition-opacity duration-500">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md border border-[var(--border-subtle)]">⌘ P</span>
          <span>Search Files</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md border border-[var(--border-subtle)]">⌘ I</span>
          <span>Agent Refactor</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md border border-[var(--border-subtle)]">⌘ J</span>
          <span>Toggle Terminal</span>
        </div>
      </div>

    </div>
  );
};

/**
 * DesignStudioPage — /dashboard/designstudio
 * Shell route for design tooling (CMS themes, canvas, layout). Deep features ship incrementally.
 */
import React from 'react';
import { Palette } from 'lucide-react';

export const DesignStudioPage: React.FC = () => {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-[var(--bg-app)]">
      <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[var(--solar-magenta)]/15 flex items-center justify-center text-[var(--solar-magenta)]">
            <Palette size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--text-heading)]">Design Studio</h1>
            <p className="text-[12px] text-[var(--text-muted)]">
              Themes, layout, and visual tooling for this workspace.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-6 text-[13px] text-[var(--text-muted)]">
          Studio configuration and CMS-linked design tools will appear here. Use the Agent workspace for the 3D engine and canvas tabs.
        </div>
      </div>
    </div>
  );
};

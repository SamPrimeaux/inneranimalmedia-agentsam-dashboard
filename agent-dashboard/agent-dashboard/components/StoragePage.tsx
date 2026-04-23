/**
 * StoragePage — /dashboard/storage
 * Entry point for R2 / asset storage overview. Explorer UI remains on the Agent workspace rail.
 */
import React from 'react';
import { HardDrive } from 'lucide-react';

export const StoragePage: React.FC = () => {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-[var(--bg-app)]">
      <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[var(--solar-cyan)]/15 flex items-center justify-center text-[var(--solar-cyan)]">
            <HardDrive size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--text-heading)]">Storage</h1>
            <p className="text-[12px] text-[var(--text-muted)]">
              Cloudflare R2 buckets and object storage tied to this dashboard.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-6 text-[13px] text-[var(--text-muted)]">
          Open <span className="text-[var(--text-main)] font-medium">Agent</span> and use{' '}
          <span className="text-[var(--text-main)] font-medium">Remote Explorers → R2</span> for full bucket browse, upload, and sync.
          This page is the navigation anchor for storage-related workflows.
        </div>
      </div>
    </div>
  );
};

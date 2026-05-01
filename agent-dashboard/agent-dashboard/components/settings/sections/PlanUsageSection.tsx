import React from 'react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import { Toggle, formatPlanLabel } from '../settingsUi';

export type PlanUsageSectionProps = { data: SettingsPanelModel };

export function PlanUsageSection({ data }: PlanUsageSectionProps) {
  const u = data.usageData;
  return (
    <div className="flex flex-col gap-4 max-w-6xl">
      <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">
        Plan &amp; Usage
      </h2>
      {data.usageError ? (
        <div className="text-[11px] text-[var(--color-danger)]">{data.usageError}</div>
      ) : null}
      {data.usageLoading && !u ? (
        <div className="text-[12px] text-[var(--text-muted)]">Loading usage…</div>
      ) : null}
      {u && (
        <>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              Period: {new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            {(() => {
              const summary = Array.isArray(u.summary) ? u.summary : [];
              const total = summary.reduce((acc: number, r: any) => acc + Number(r.cost_usd || 0), 0);
              const input = summary.reduce((acc: number, r: any) => acc + Number(r.input_tokens || 0), 0);
              const output = summary.reduce((acc: number, r: any) => acc + Number(r.output_tokens || 0), 0);
              const calls = summary.reduce((acc: number, r: any) => acc + Number(r.call_count || 0), 0);
              return (
                <>
                  <div className="mt-2 text-[26px] font-semibold text-[var(--solar-cyan)]">
                    ${total.toFixed(2)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="text-[10px] px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">
                      {input.toLocaleString()} input
                    </span>
                    <span className="text-[10px] px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">
                      {output.toLocaleString()} output
                    </span>
                    <span className="text-[10px] px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">
                      {calls.toLocaleString()} calls
                    </span>
                  </div>
                </>
              );
            })()}
            <div className="mt-4 rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
              <div className="grid grid-cols-6 gap-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
                <div className="col-span-2">Model</div>
                <div className="col-span-1">Provider</div>
                <div className="col-span-1">Input</div>
                <div className="col-span-1">Output</div>
                <div className="col-span-1 text-right">Cost</div>
              </div>
              {(Array.isArray(u.summary) ? u.summary : []).map((r: any, i: number) => (
                <div
                  key={`${r.model_used || i}`}
                  className="grid grid-cols-6 gap-0 px-4 py-3 border-b border-[var(--border-subtle)] text-[11px] items-center"
                >
                  <div className="col-span-2 text-[var(--text-main)] truncate">
                    {String(r.model_used || '—')}
                  </div>
                  <div className="col-span-1 text-[var(--text-muted)]">{String(r.provider || '—')}</div>
                  <div className="col-span-1 text-[10px] text-[var(--text-muted)] font-mono">
                    {Number(r.input_tokens || 0).toLocaleString()}
                  </div>
                  <div className="col-span-1 text-[10px] text-[var(--text-muted)] font-mono">
                    {Number(r.output_tokens || 0).toLocaleString()}
                  </div>
                  <div className="col-span-1 text-right text-[10px] text-[var(--text-muted)] font-mono">
                    ${Number(r.cost_usd || 0).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-semibold text-[var(--text-main)]">Spend Ledger</div>
              <div className="flex items-center gap-2">
                <select
                  value={data.usageProvider}
                  onChange={(e) => {
                    data.setUsageProvider(e.target.value);
                    data.setUsagePage(1);
                    void data.loadUsage(1, e.target.value, data.usageModel);
                  }}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[11px]"
                >
                  <option value="">All providers</option>
                  {Array.from(
                    new Set(
                      (Array.isArray(u.summary) ? u.summary : [])
                        .map((x: any) => String(x.provider || ''))
                        .filter(Boolean),
                    ),
                  ).map((p: string) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <select
                  value={data.usageModel}
                  onChange={(e) => {
                    data.setUsageModel(e.target.value);
                    data.setUsagePage(1);
                    void data.loadUsage(1, data.usageProvider, e.target.value);
                  }}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[11px]"
                >
                  <option value="">All models</option>
                  {Array.from(
                    new Set(
                      (Array.isArray(u.summary) ? u.summary : [])
                        .map((x: any) => String(x.model_used || ''))
                        .filter(Boolean),
                    ),
                  ).map((m: string) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
              <div className="grid grid-cols-6 gap-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
                <div className="col-span-1">Date</div>
                <div className="col-span-2">Model</div>
                <div className="col-span-1">Provider</div>
                <div className="col-span-1">Tokens</div>
                <div className="col-span-1 text-right">Cost</div>
              </div>
              {(Array.isArray(u.ledger) ? u.ledger : []).map((r: any, i: number) => (
                <div
                  key={String(r.id || i)}
                  className="grid grid-cols-6 gap-0 px-4 py-3 border-b border-[var(--border-subtle)] text-[11px] items-center"
                >
                  <div className="col-span-1 text-[10px] text-[var(--text-muted)]">
                    {r.created_at ? new Date(String(r.created_at)).toLocaleDateString() : '—'}
                  </div>
                  <div className="col-span-2 text-[var(--text-main)] truncate">{String(r.model_used || '—')}</div>
                  <div className="col-span-1 text-[var(--text-muted)]">{String(r.provider || '—')}</div>
                  <div className="col-span-1 text-[10px] text-[var(--text-muted)] font-mono">
                    {Number(r.input_tokens || 0) + Number(r.output_tokens || 0)}
                  </div>
                  <div className="col-span-1 text-right text-[10px] text-[var(--text-muted)] font-mono">
                    ${Number(r.cost_usd || 0).toFixed(4)}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]"
                onClick={() => {
                  const p = Math.max(1, data.usagePage - 1);
                  data.setUsagePage(p);
                  void data.loadUsage(p, data.usageProvider, data.usageModel);
                }}
              >
                Prev
              </button>
              <div className="text-[11px] text-[var(--text-muted)]">Page {data.usagePage}</div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]"
                onClick={() => {
                  const p = data.usagePage + 1;
                  data.setUsagePage(p);
                  void data.loadUsage(p, data.usageProvider, data.usageModel);
                }}
              >
                Next
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
              <div className="text-[12px] font-semibold text-[var(--text-main)]">Budget</div>
              <div className="mt-3 flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-[11px]">
                  <span className="text-[var(--text-muted)]">Monthly Limit (USD)</span>
                  <input
                    value={data.budgetMonthlyLimit}
                    onChange={(e) => data.setBudgetMonthlyLimit(e.target.value)}
                    onBlur={() => {
                      void (async () => {
                        try {
                          await data.patchProfile([
                            {
                              setting_key: 'budget.monthly_limit_usd',
                              setting_value: String(data.budgetMonthlyLimit || ''),
                            },
                          ]);
                        } catch (e) {
                          data.setUsageError(e instanceof Error ? e.message : 'Save failed');
                        }
                      })();
                    }}
                    className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] font-mono"
                    inputMode="decimal"
                  />
                </label>
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-[var(--text-muted)]">Hard stop when limit reached</div>
                  <Toggle
                    on={data.budgetHardStop}
                    onChange={(v) => {
                      data.setBudgetHardStop(v);
                      void data
                        .patchProfile([
                          { setting_key: 'budget.hard_stop', setting_value: v ? 'true' : 'false' },
                        ])
                        .catch(() => data.setBudgetHardStop(!v));
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
              <div className="text-[12px] font-semibold text-[var(--text-main)]">Billing</div>
              <div className="mt-3 text-[11px] text-[var(--text-muted)]">
                Plan:{' '}
                <span className="text-[var(--text-main)] font-mono">{formatPlanLabel(data.profilePlan)}</span>
              </div>
              <div className="mt-2">
                <a
                  href="/dashboard/billing"
                  className="text-[11px] text-[var(--solar-cyan)] hover:underline"
                >
                  Manage Billing
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

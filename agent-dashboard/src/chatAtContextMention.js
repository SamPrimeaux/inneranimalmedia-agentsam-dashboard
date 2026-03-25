/**
 * Pure @-mention helpers (no React / forwardRef). Loaded before ChatAtContextPicker
 * so AgentDashboard does not evaluate the picker module during initial bundle init
 * (avoids minifier TDZ ordering issues across the large dashboard chunk).
 */

export const AT_CONTEXT_CATEGORIES = [
  { id: "files", label: "files", title: "Files", hint: "R2 file list" },
  { id: "github", label: "github", title: "GitHub", hint: "Repo file tree" },
  { id: "workers", label: "workers", title: "Workers", hint: "Cloudflare workers" },
  { id: "db", label: "db", title: "DB tables", hint: "sqlite_master" },
  { id: "memory", label: "memory", title: "Memory", hint: "agent_memory_index" },
];

/**
 * Active @-mention token: not inside [@pill: ...] (exclude @ right after [).
 * @param {string} input
 * @param {number} cursor
 * @returns {{ start: number, end: number, query: string } | null}
 */
export function getActiveAtMention(input, cursor) {
  if (typeof input !== "string" || cursor == null || cursor < 0) return null;
  const before = input.slice(0, cursor);
  const m = before.match(/(?:^|[\s\n(])@([^\s@]*)$/);
  if (!m) return null;
  const atIndex = before.lastIndexOf("@", cursor - 1);
  if (atIndex < 0) return null;
  return { start: atIndex, end: cursor, query: m[1] ?? "" };
}

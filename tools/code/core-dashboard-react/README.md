# core-dashboard-react

**What:** Primary agent UI — React (Vite), source under `agent-dashboard/src/`. Built output is the JS/CSS bundle referenced from `dashboard/agent.html` (and related shells).

**Repo:** `agent-dashboard/` — entry `AgentDashboard.jsx`, panels, theme tokens (CSS variables, no hex in JSX per project rules).

**Wires in:** Fetches session + chat + tools against **same host** `inneranimalmedia.com` APIs. Version string in HTML (`v=`) must match after CI/CD promote. Sandbox: `inneranimal-dashboard.meauxbility.workers.dev`.

**UI integration:** Add routes/components here; wire to worker APIs only. Build: `npm run build:vite-only` from `agent-dashboard`, then sandbox deploy script (see `AGENTS.md`).

**Do not:** Rewrite `FloatingPreviewPanel.jsx` or `agent.html` wholesale; surgical edits with line approval.

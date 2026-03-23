---
description: Delegate a Task subagent for tomorrow — UI + Agent (execution plan, SettingsPanel, chat)
argument-hint: [optional focus — e.g. execution plan card, SettingsPanel, streaming+tools]
---

# Tomorrow UI + Agent (subagent brief)

**User focus today:** $ARGUMENTS

Use the **Task** tool with **`subagent_type: explore`** (map/code paths) or **`generalPurpose`** (if implementing after Sam approves). Prefer **`readonly: true`** for audits; **`readonly: false`** only when Sam asked for edits in this thread.

## Mission

Advance **finish UI + agent functionality**: execution plan surface in the main Agent area (cards, Approve/Reject), alignment with chat/worker contracts, and any **SettingsPanel** / **AgentDashboard** wiring already approved in checklist — without rewriting locked files (`handleGoogleOAuthCallback` / `handleGitHubOAuthCallback`, wholesale `agent.html` / `FloatingPreviewPanel.jsx`).

## Read before coding

1. **D1 (production):** `SELECT value FROM agent_memory_index WHERE tenant_id = 'system' AND key = 'today_todo';`
2. **Plans in repo:**
   - `.cursor/plans/tomorrow_agent_workflow_0e1f7ded.plan.md` (images, streaming+tools, FloatingPreview, git cards)
   - `docs/plans/TOMORROW_2026-03-23_UI_SETTINGS_TERMINAL_PLAN.md` (if present — Settings / terminal)
3. **Worker routes:** Phase 1 settings APIs live in `worker.js` (`handlePhase1PlatformD1Routes`); do not add duplicate routes.

## Guardrails (IAM)

- **No** `wrangler deploy` / `npm run deploy` / R2 upload / `wrangler secret put` unless Sam typed **deploy approved** in the **parent** chat and scope includes deploy.
- **Production:** `wrangler.production.toml` only with Sam approval; **Sandbox:** `wrangler.jsonc` when Sam asks for sandbox.
- **FloatingPreviewPanel.jsx:** surgical edits only; state line numbers first.
- **OAuth handlers in `worker.js`:** do not edit without Sam’s line-by-line approval.

## Deliverable back to parent

Return:

1. **Findings** (what exists vs missing) for execution plan UI + API touchpoints.
2. **Files + line ranges** (e.g. `AgentDashboard.jsx`, `worker.js` plan/approve routes).
3. **Risks** (streaming vs tools, session keys).
4. **Next step** (one concrete PR-sized action).

Do **not** paste secrets or session tokens.

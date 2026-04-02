# IAM Settings + Dashboard — Full audit, backend first, then UI (single approval gate, one deploy)

Use this as the **first message** (or slash command body) for a Cursor chat that must **not** do half-ass UI passes: audit first, backend/routing proposals before UI, explicit approval, then one full UI rebuild and **one deployment** to validate.

---

## Non-negotiable process (follow in order)

1. **AUDIT (read-only)**  
   Inventory the current production behavior vs desired behavior. No code edits yet.  
   Output:
   - Table: **Settings tab id** | **Current UI** (1 line) | **What’s wrong** | **Required backend** (YES/NO) | **Existing worker routes** (path + method) | **Gaps** (new route / new D1 / new R2).
   - Same for **any** non-settings surfaces this work touches (e.g. FloatingPreviewPanel, AgentDashboard) if they’re required for “Monaco + chat” or unified General/vault.

2. **BACKEND & ROUTING FIRST (proposed diffs only until approved)**  
   For every gap that needs **new or changed** HTTP routes, D1 queries, or auth:
   - Propose **exact** `worker.js` changes: path, method, request/response shape, which tables/bindings, error cases.
   - **Do not** merge backend + UI in one blind edit. Backend proposal must be reviewable on its own.
   - Respect locks: **do not** edit `handleGoogleOAuthCallback`, `handleGitHubOAuthCallback`, or OAuth URLs; **do not** change `wrangler.production.toml` bindings without explicit Sam approval.

3. **STOP FOR APPROVAL — “mockup vs proposed”**  
   After backend proposal is written, **pause**.  
   Present:
   - **A)** Short summary of **current** Settings UX (what exists today — placeholders, wrong labels, fake metrics).  
   - **B)** **Proposed** Settings structure: final tab list, labels, what each pane contains, what APIs each pane calls.  
   - **C)** Explicit **diff intent** so Cursor/Git can show: *“old half-ass mockup”* vs *“proposed refined UI”* — e.g. list of `SettingsPanel.jsx` sections to **delete** (all `SettingsPlaceholderTab` bodies) vs **replace** with real components.  
   **Wait for Sam:** “approved” / “change X then approved” before any implementation.

4. **IMPLEMENTATION (only after approval)**  
   - Apply **approved** backend changes first (worker + migrations if any).  
   - Then **rebuild UI in one pass** in the agreed files: **no placeholders**, **no “coming soon”**; empty states must be honest (e.g. “No data yet” + link or reason) + real loading/error.  
   - **One cohesive Settings UI** per the approved map (Integrations, Development, Repositories, Docs with provider cards, Network, Indexing, Hooks, Tools & MCP, Models, Agents, Plan & Usage, General+vault unified, Rules/Skills/Subagents per approved pattern — Monaco+chat only if approved and scoped to specific files).

5. **SINGLE DEPLOYMENT TO VALIDATE**  
   After implementation: **one** production validation deploy (Sam types **deploy approved**):  
   - Build `agent-dashboard`, upload R2 bundle + `dashboard/agent.html` as per repo scripts, deploy worker, record version in session log.  
   - **No** second “cleanup” deploy for the same initiative unless something is broken.

---

## Scope (full list — all in audit; implement only what’s approved)

- **Docs vs Repositories:** Repositories = GitHub; **Docs** = provider cards (Cursor, Anthropic, OpenAI API, Google AI, Cloudflare) — modular docs/instructions, no placeholder grid.  
- **Integrations** (rename from Plugins): real integrations surface for current + future project connections.  
- **Development** (rename from Beta): Cloudflare Workers / Wrangler — real terminal/deploy wiring, not a stub.  
- **Network:** tunnel + terminal health, reconnect runbook, **no** secrets in plaintext UI — reference vault / env.  
- **Indexing & Docs:** AutoRAG / AI Search indexing — real status + actions only if API exists or is added in step 2.  
- **Hooks:** real hooks UI wired to real routes.  
- **Tools & MCP:** real commands + MCP, not placeholder.  
- **Rules, Skills, Subagents:** no modal-first CRUD if approved alternative is Monaco + chat — **must** name files and callback contract in audit.  
- **Marketplace:** real catalog model for integrations users can connect.  
- **Cloud Agents / Models / Agents:** real data + management quality (e.g. ~70 models), not placeholder.  
- **Plan & Usage:** accurate spend, period dropdown, model/provider breakdown, **correct** finance link.  
- **General:** General + secret vault **one fluent** page — no two disjoint panels.

---

## Deliverables (in order)

1. **Audit document** (markdown in reply or `docs/` only if Sam asks).  
2. **Backend proposal** (diffs + file list).  
3. **Approval** (explicit).  
4. **Full implementation** + **session log** + **one deploy**.

---

## Rejection criteria

- Partial tab renames without wiring.  
- “Placeholder” strings where a real API exists.  
- Multiple deploys for the same feature wave.  
- Editing locked OAuth or `wrangler.production.toml` without Sam saying so.

**Start with step 1 (AUDIT) only. Do not write production code until Sam approves the backend + UX map.**

---

## Repo reminders (canonical)

- `agent-dashboard/src/SettingsPanel.jsx` — settings nav and tab bodies.  
- Deploy: `./scripts/deploy-with-record.sh` or documented R2 + worker flow; **deploy approved** from Sam.  
- Locked: OAuth handlers in `worker.js`, `agent.html` surgical edits, `FloatingPreviewPanel.jsx` surgical edits.

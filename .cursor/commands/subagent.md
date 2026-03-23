---
description: Delegate with Cursor Task subagents — scope, readonly audits, no silent deploys
argument-hint: [what to research or verify — one sentence]
---

# Subagent discipline (IAM monorepo)

Goal: **$ARGUMENTS**

## Tomorrow UI + Agent

For the next-session **finish UI + agent** sprint, use slash command **`/tomorrow-ui-agent`** (`.cursor/commands/tomorrow-ui-agent.md`) — it supplies a ready mission brief, D1 `today_todo` pointer, and guardrails for the Task prompt.

## When to delegate

Use the **Task** tool (subagents) when:

- The user needs a **broad codebase search** across many files (`explore`, quick/medium depth).
- A **long wrangler / shell** sequence is needed and should not clutter the main thread (`shell` subagent).
- You want an **isolated review** or checklist pass (`code-reviewer`, `readonly: true`).

Do **not** launch subagents for one-file edits you can do directly.

## Permissions and guardrails

1. **Readonly:** For audits, security review, or “map only” tasks, set **`readonly: true`** on the Task so the subagent cannot write files or use MCP destructively.
2. **Single intent:** One clear deliverable per Task (e.g. “list all `/api/agent/*` routes in worker.js with line numbers”).
3. **No deploy from subagent:** Subagents must **not** run `wrangler deploy`, `npm run deploy`, R2 uploads, or `wrangler secret put` unless Sam has typed **deploy approved** in the **parent** chat and the parent explicitly told you to run deploy — prefer returning a command list for Sam to approve.
4. **Production lock:** If Sam said **do not touch inneranimalmedia / production**, subagents must not edit `wrangler.production.toml`, must not deploy `-c wrangler.production.toml`, and must not assume production R2 targets unless scoped.
5. **Return contract:** Instruct the subagent to return: **findings**, **file paths + line ranges**, **risks**, and **recommended next step** — not a full rewrite.

## After the subagent returns

- Merge summaries into a short answer for Sam.
- If anything requires code change, **state file + line range + before/after** and wait for **approved** / **go** per `sam-rules.mdc` before editing protected files.
- Log significant outcomes in **`docs/cursor-session-log.md`** when the session materially changed plans or deploy state.

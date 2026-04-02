---
description: Which Cursor skills to load for IAM, Cloudflare, MCP, rules, and SaaS context
argument-hint: [topic — e.g. worker, mcp, d1, deploy, ui]
---

# Skills — load before improvising

User focus: **$ARGUMENTS**

When a **skill** matches the task, **read the skill’s `SKILL.md` first** and follow it. Do not rely on memory alone for Wrangler syntax, MCP deploy paths, or Cloudflare platform details.

## Project-adjacent (user skills — paths under home)

- **Company / strategy:** `~/.cursor/skills/company-saas-context/SKILL.md` — Inner Animals, Meauxbility, product lineup, roadmap alignment.
- **Cursor rules authoring:** `~/.cursor/skills-cursor/create-rule/SKILL.md`
- **Cursor skills authoring:** `~/.cursor/skills-cursor/create-skill/SKILL.md`
- **OpenAI product docs:** `~/.codex/skills/.system/openai-docs/SKILL.md` when the task is OpenAI API / model choice (official docs only).

## Cloudflare (Cursor plugin cache)

Skills live under the Cloudflare plugin cache directory (path varies by install). Search for folders named `skills` under `~/.cursor/plugins/cache/cursor-public/cloudflare/` and open the relevant **`SKILL.md`**. Useful names include:

- **workers-best-practices** — Worker review and anti-patterns
- **wrangler** — CLI before running wrangler commands
- **cloudflare** — platform overview
- **building-mcp-server-on-cloudflare** — MCP on Workers
- **building-ai-agent-on-cloudflare** / **agents-sdk** — Agents SDK patterns
- **durable-objects** — DO design
- **web-perf** — performance audits (if using browser tooling)

## IAM-specific guardrails (not a skill file)

These are **repo rules**, not skills: `.cursorrules`, `.cursor/rules/sam-rules.mdc`, `.cursor/rules/hard-rules.mdc`. Skills do **not** override deploy approval or OAuth locks.

## Habit

If the user says “use the Cloudflare skill” or “check wrangler,” **open the skill file**, then act. If no skill fits, say so and proceed with repo docs (`README.md`, `docs/LOCATIONS_AND_DEPLOY_AUDIT.md`).

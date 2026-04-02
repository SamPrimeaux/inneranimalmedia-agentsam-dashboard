---
name: iam-platform-sync
description: InnerAnimalMedia monorepo — deploy order, R2 buckets, D1, multi-provider testing. Use for dashboard/worker/migration tasks on inneranimalmedia.com.
---

# IAM platform (Agent Sam)

## When invoked

- Changing `worker.js`, `agent-dashboard`, `dashboard/*.html`, or D1.
- Uploading to R2 or asking where a file belongs.
- Testing OpenAI, Anthropic, or Google models through the worker.

## Must follow

1. **Sandbox first:** `build:vite-only` then `deploy-sandbox.sh`; benchmark before prod promote.
2. **Bucket map:** TOOLS `tools/code/` for runbooks; **agent-sam** for dashboard HTML and Vite build; **autorag** for small RAG markdown only.
3. **Locked:** Do not edit OAuth callbacks in `worker.js` without approval; do not change `wrangler.production.toml` bindings without approval.
4. **D1:** Propose SQL; execute only after explicit approval.

## Pointers

- Incremental steps: repo `tools/code/skills/WORKFLOW.md` — public `https://tools.inneranimalmedia.com/code/skills/WORKFLOW.md`
- Full skill index: `tools/code/skills/README.md`
- AI testing pack: `tools/code/integration/`

Git repo path: `march1st-inneranimalmedia` (this monorepo is canonical).

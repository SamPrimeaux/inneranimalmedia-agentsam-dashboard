# core-tools-r2

**What:** R2 bucket **tools**, public host `tools.inneranimalmedia.com` — Excalidraw libs under `draw/`, Monaco/code under `code/`, saved pages under `pages/`. Worker maps hostname to `env.TOOLS` binding.

**Repo:** This folder (`tools/code/`) is **documentation and layout** for agents; runtime artifacts upload to R2 via wrangler/S3, not automatic from git.

**Wires in:** Dashboard and shell HTML use `TOOLS_PUBLIC_ORIGIN` / meta for links. Agent chat may reference public URLs for review. Billing and auth stay on main worker.

**UI integration:** Treat as CDN for user-generated or exported assets. New UI features that "save code" should POST to worker APIs that write **TOOLS** (or return presigned paths), not assume direct browser writes.

**Do not:** Confuse with `agent-sam` (dashboard) or `autorag` (knowledge docs).

# core-mcp

**What:** Separate Worker `inneranimalmedia-mcp-server` — JSON-RPC MCP at `https://mcp.inneranimalmedia.com/mcp`. Tools registered in D1 (`mcp_registered_tools`); auth via Bearer (same token as Cursor config).

**Repo:** `inneranimalmedia-mcp-server/` — deploy only with `npx wrangler deploy -c wrangler.toml` from that directory (never repo root wrangler).

**Wires in:** Cursor/agents call MCP; main worker and dashboard do not replace MCP for tool execution. D1 and R2 operations that need elevation go through MCP tools + worker where applicable.

**UI integration:** Dashboard "MCP" panels reflect server capabilities; adding a user-facing feature that needs a new tool usually means MCP server change + D1 registration + worker only if proxying.

**Do not:** Deploy MCP from monorepo root; do not commit bearer tokens outside `.cursor/mcp.json`.

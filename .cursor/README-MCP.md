# MCP setup (Cursor)

## Inner Animal MCP (mcp.inneranimalmedia.com)

The project is configured to use the Inner Animal MCP server from Cursor with Bearer auth so you are not prompted for consent.

- **Config:** `.cursor/mcp.json` (gitignored; copy from `.cursor/mcp.json.example` and set your token).
- **Server:** `https://mcp.inneranimalmedia.com/mcp`
- **Auth:** `Authorization: Bearer <MCP_AUTH_TOKEN>`. The same token is set as `MCP_AUTH_TOKEN` on the main worker and the **inneranimalmedia-mcp-server** worker.

After changing `.cursor/mcp.json`, fully restart Cursor so MCP servers reload.

## Stopping Cloudflare MCP consent popups

Repeated “MCP consent” or “Cloudflare MCP” prompts come from **Cursor’s Cloudflare MCP integration** (the IDE’s built-in or added Cloudflare server), not from the Agent Sam UI or the Inner Animal MCP above.

To stop them:

1. Open **Cursor Settings** (Cmd/Ctrl + ,) → **Tools & MCP** (or **Features** → **MCP**).
2. Find **Cloudflare** in the list of MCP servers.
3. **Disable** it if you don’t need it, or fix its configuration/credentials so it stops failing and re-asking for consent.

No code changes are required in this repo for Cloudflare consent; it’s controlled in Cursor’s MCP settings.

## Token and security

- `MCP_AUTH_TOKEN` is stored in:
  - Main worker (`worker.js` / wrangler): **wrangler secret** `MCP_AUTH_TOKEN`
  - MCP server worker (mcp.inneranimalmedia.com): **wrangler secret** `MCP_AUTH_TOKEN`
- For Cursor, the token is in `.cursor/mcp.json` (local only; the file is in `.gitignore`).
- To use this project on another machine, copy `.cursor/mcp.json.example` to `.cursor/mcp.json` and set `Authorization: Bearer <your_MCP_AUTH_TOKEN>` in the `inneranimal-mcp` headers.

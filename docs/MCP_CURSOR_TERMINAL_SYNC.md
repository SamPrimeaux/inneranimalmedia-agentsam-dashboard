# MCP + Cursor + Terminal sync

Quick reference so Cursor (agent), your MCP server, and terminal checks stay aligned.

---

## MCP server (InnerAnimalMedia)

| Item | Value |
|------|--------|
| **Endpoint** | `https://mcp.inneranimalmedia.com/mcp` |
| **Auth** | `Authorization: Bearer <token>` (token in Cursor config only; do not commit). |
| **Required request header** | `Accept: application/json, text/event-stream` (server returns 406 without it). |
| **Protocol** | JSON-RPC 2.0 over HTTP; server can respond with SSE (`event: message`, `data: {...}`). |
| **Server info** | InnerAnimalMedia MCP v1.0.0, protocolVersion 2024-11-05, capabilities: tools (listChanged: true). |

---

## Cursor config (project)

- **File:** `.cursor/mcp.json` (project root).
- **Server name:** `inneranimalmedia`.
- **Headers:** Cursor sends the `Authorization` header from config. The MCP client should send `Accept: application/json, text/event-stream` automatically for MCP; no need to set it in `mcp.json`.
- **Restart:** After editing, use **Cmd+Shift+P** → “MCP: Restart Servers” (or restart Cursor).

Current config matches the endpoint and auth above; Cursor and MCP are in sync when this file is unchanged.

---

## Terminal: quick health check

Use this when you want to verify the MCP server from the shell (same as Cursor’s server, with the required `Accept` header):

```bash
curl -s -X POST https://mcp.inneranimalmedia.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer aaa66d5ad532a53e2e1c4823810d25ac6e18361a75c8f036016d50b243721770" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
```

**Success:** You see an SSE line like `data: {"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"InnerAnimalMedia MCP","version":"1.0.0"}},...}`.

**406 / “Not Acceptable”:** Add or fix the header: `-H "Accept: application/json, text/event-stream"`.

---

## Summary

| Layer | Status |
|-------|--------|
| **MCP server** | Live at mcp.inneranimalmedia.com; requires Bearer token + `Accept: application/json, text/event-stream`. |
| **Cursor** | `.cursor/mcp.json` has `inneranimalmedia` with URL and Bearer token; MCP client sends Accept. |
| **Terminal** | Use the curl command above (including the Accept header) to confirm the server from your machine. |

You, your MCP, and your terminal are in sync when: (1) Cursor uses this project’s `.cursor/mcp.json`, (2) the server is up and returns the initialize result, and (3) the same curl from your terminal succeeds.

# core-realtime

**What:** WebSocket and long-lived channels — **terminal** (`/api/agent/terminal/ws` + tunnel to `terminal.inneranimalmedia.com` / local `iam-pty`), **collaborative draw** (`/api/collab/draw` + DO `IAM_COLLAB`).

**Repo:** `worker.js` handlers + Durable Object classes bundled with worker. Terminal server is separate repo (`~/iam-pty/`).

**Wires in:** React dashboard opens WS with same-site cookies/session; PTY process must be running for shell. Draw uses Excalidraw + DO sync.

**UI integration:** Terminal/draw UIs must keep protocol messages backward compatible when redesigning; add feature flags or version handshakes in worker if changing frames.

**Do not:** Expose PTY or collab endpoints without auth checks already in worker paths.

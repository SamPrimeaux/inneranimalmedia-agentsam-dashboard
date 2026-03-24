#!/usr/bin/env node
/**
 * Personal terminal server: WebSocket + node-pty.
 * Spawns a shell (bash/zsh), pipes stdin/stdout bidirectionally.
 * Auth: validate TERMINAL_SECRET via query param ?token=SECRET before allowing connection.
 *
 * Run: TERMINAL_SECRET=your-secret PORT=3099 node server/terminal.js
 * Or from repo root: cd server && npm start
 */

import { createServer } from "http";
import { WebSocketServer } from "ws";
import * as pty from "node-pty";

const PORT = Number(process.env.PORT) || 3099;
const SECRET = process.env.TERMINAL_SECRET || "";
const SHELL = process.env.SHELL || (process.platform === "win32" ? "powershell.exe" : "bash");

if (!SECRET) {
  console.warn("Warning: TERMINAL_SECRET not set. Set it in production.");
}

const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("IAM Terminal Server. Connect via WebSocket with ?token=SECRET\n");
});

const wss = new WebSocketServer({ server, path: "/" });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const token = url.searchParams.get("token") || req.headers["sec-websocket-protocol"]?.split(",").map((s) => s.trim()).find((s) => s.startsWith("token."))?.slice(6);

  if (SECRET && token !== SECRET) {
    ws.close(4001, "Unauthorized");
    return;
  }

  const shell = pty.spawn(SHELL, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || process.cwd(),
    env: {
      ...process.env,
      TERM: "xterm-256color",
      PS1: "[ sam@iam \\W ]\\$ ",
    },
  });

  shell.onData((data) => {
    try {
      if (ws.readyState === 1) ws.send(data);
    } catch (e) {
      shell.kill();
    }
  });

  shell.onExit(() => {
    try {
      ws.close();
    } catch (_) {}
  });

  ws.on("message", (buf) => {
    try {
      const raw = Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf);
      let toWrite = raw;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.type === "run" && typeof parsed.command === "string") {
          toWrite = parsed.command.trimEnd() + "\n";
        }
      } catch (_) {
        // Not JSON: treat as raw stdin
      }
      shell.write(toWrite);
    } catch (_) {}
  });

  ws.on("close", () => {
    try {
      shell.kill();
    } catch (_) {}
  });

  ws.on("error", () => {
    try {
      shell.kill();
    } catch (_) {}
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Terminal server listening on ws://127.0.0.1:${PORT} (use tunnel for wss)`);
});

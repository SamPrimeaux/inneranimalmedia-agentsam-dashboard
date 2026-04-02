/**
 * Personal terminal server: WebSocket + node-pty.
 * Spawns a shell (bash/zsh), pipes stdin/stdout bidirectionally.
 * Auth: validate TERMINAL_SECRET via query param ?token=SECRET before allowing connection.
 *
 * Run: TERMINAL_SECRET=your-secret PORT=3099 npx tsx server/terminal.ts
 * Or: bun server/terminal.ts (with Bun and node-pty installed)
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

const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("IAM Terminal Server. Connect via WebSocket with ?token=SECRET\n");
});

const wss = new WebSocketServer({ server, path: "/" });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const token =
    url.searchParams.get("token") ||
    req.headers["sec-websocket-protocol"]
      ?.split(",")
      .map((s: string) => s.trim())
      .find((s: string) => s.startsWith("token."))
      ?.slice(6);

  if (SECRET && token !== SECRET) {
    ws.close(4001, "Unauthorized");
    return;
  }

  const shell = pty.spawn(SHELL, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || process.cwd(),
    env: { ...process.env, TERM: "xterm-256color" },
  });

  shell.onData((data: string) => {
    try {
      if (ws.readyState === 1) ws.send(data);
    } catch {
      shell.kill();
    }
  });

  shell.onExit(() => {
    try {
      ws.close();
    } catch {
      /* noop */
    }
  });

  ws.on("message", (buf: Buffer | string) => {
    try {
      const raw = Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf);
      let toWrite = raw;
      try {
        const parsed = JSON.parse(raw) as { type?: string; command?: string };
        if (parsed?.type === "run" && typeof parsed.command === "string") {
          toWrite = parsed.command.trimEnd() + "\n";
        }
      } catch {
        // Not JSON: treat as raw stdin
      }
      shell.write(toWrite);
    } catch {
      /* noop */
    }
  });

  ws.on("close", () => {
    try {
      shell.kill();
    } catch {
      /* noop */
    }
  });

  ws.on("error", () => {
    try {
      shell.kill();
    } catch {
      /* noop */
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Terminal server listening on ws://127.0.0.1:${PORT} (use tunnel for wss)`);
});

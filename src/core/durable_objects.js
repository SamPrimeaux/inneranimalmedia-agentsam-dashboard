/**
 * Core Layer: Durable Objects
 * Handles stateful collaborative sessions and SQL-backed agent chat history.
 * Deconstructed from legacy worker.js.
 */
import { DurableObject } from 'cloudflare:workers';

/**
 * Realtime broadcast room for workflow step events and shared canvas state.
 */
export class IAMCollaborationSession extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname.endsWith('/broadcast')) {
      const text = await request.text();
      const sockets = this.ctx.getWebSockets();
      let delivered = 0;
      for (const ws of sockets) {
        try { ws.send(text); delivered++; } catch (_) {}
      }
      return new Response(JSON.stringify({ ok: true, delivered }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'GET' && url.pathname === '/canvas/state') {
      const elements = (await this.ctx.storage.get('canvas_elements')) ?? [];
      const activeTheme = (await this.ctx.storage.get('canvas_active_theme')) ?? null;
      return new Response(JSON.stringify({ canvasElements: elements, activeTheme }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'POST' && url.pathname === '/canvas/elements') {
      const { elements } = await request.json();
      await this.ctx.storage.put('canvas_elements', elements);
      const msg = JSON.stringify({ type: 'canvas_update', elements });
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(msg); } catch (_) {}
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    return new Response(JSON.stringify({ do: 'IAMCollaborationSession', ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Agent Chat Session: SQLite-backed message persistence for RAG loops.
 */
export class AgentChatSqlV1 extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this.env = env;
    this.ptyWs = null;          // outbound WebSocket to iam-pty
    this.outputBuffer = [];     // ring buffer — last 800 PTY chunks
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS session_messages (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model_used TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    )`);
  }

  // ── PTY outbound connection ───────────────────────────────────────────────
  async _connectToPty(token, themeSlug) {
    const raw = (this.env.TERMINAL_WS_URL || '').trim();
    if (!raw) return;
    let wssUrl = raw.startsWith('https://') ? 'wss://' + raw.slice(8)
               : raw.startsWith('http://')  ? 'ws://'  + raw.slice(7)
               : raw;
    const sep = wssUrl.includes('?') ? '&' : '?';
    const ptyUrl = `${wssUrl}${sep}token=${encodeURIComponent(token)}&theme_slug=${encodeURIComponent(themeSlug || 'meaux-storm-gray')}`;

    const resp = await fetch(ptyUrl, {
      headers: {
        Upgrade: 'websocket', Connection: 'Upgrade',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
        'x-terminal-secret': this.env.TERMINAL_SECRET || '',
      },
    });
    if (resp.status !== 101 || !resp.webSocket) return;

    const pty = resp.webSocket;
    pty.accept();
    this.ptyWs = pty;

    pty.addEventListener('message', (evt) => {
      // Buffer output (ring — keep last 800 chunks)
      this.outputBuffer.push(evt.data);
      if (this.outputBuffer.length > 800) this.outputBuffer.shift();
      // Forward to all connected browser sockets
      for (const ws of this.ctx.getWebSockets('browser')) {
        try { ws.send(evt.data); } catch (_) {}
      }
    });

    pty.addEventListener('close', () => {
      this.ptyWs = null;
      const msg = JSON.stringify({ type: 'output', data: 'PTY disconnected - reconnecting...' });
      for (const ws of this.ctx.getWebSockets('browser')) {
        try { ws.send(msg); } catch (_) {}
      }
    });
  }

  // ── Browser WebSocket handler ─────────────────────────────────────────────
  async fetch(request) {
    const url = new URL(request.url);

    // Terminal WebSocket upgrade — browser connects here
    if (url.pathname === '/terminal/ws') {
      const token     = url.searchParams.get('token')      || (this.env.TERMINAL_SECRET || '');
      const themeSlug = url.searchParams.get('theme_slug') || 'meaux-storm-gray';

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      // Tag with 'browser' so we can multicast and not confuse with PTY
      this.ctx.acceptWebSocket(server, ['browser']);

      // Replay buffered output to newly connected browser (session resume)
      for (const chunk of this.outputBuffer) {
        try { server.send(chunk); } catch (_) {}
      }

      // Connect to PTY if not already live
      if (!this.ptyWs || this.ptyWs.readyState > 1) {
        await this._connectToPty(token, themeSlug);
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/history') {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const rows = [...this.sql.exec(
        'SELECT * FROM session_messages ORDER BY created_at DESC LIMIT ?',
        limit
      )];
      return Response.json({ messages: rows.reverse() });
    }

    if (url.pathname === '/message' && request.method === 'POST') {
      const body = await request.json();
      this.sql.exec(
        'INSERT INTO session_messages (role, content, model_used, input_tokens, output_tokens) VALUES (?,?,?,?,?)',
        body.role, body.content, body.model_used, body.input_tokens || 0, body.output_tokens || 0
      );
      return Response.json({ ok: true });
    }

    return new Response('AgentChatSqlV1 DO', { status: 200 });
  }

  // ── Hibernation handlers ──────────────────────────────────────────────────
  // Called when browser sends data → forward to PTY
  webSocketMessage(ws, message) {
    if (this.ptyWs?.readyState === 1) {
      this.ptyWs.send(message);
    }
  }

  // Browser disconnected — DO stays alive, PTY connection held, buffer preserved
  webSocketClose(ws, code, reason) {
    // intentionally empty — session survives browser disconnect
  }

  webSocketError(ws, error) {
    // intentionally empty
  }
}

/**
 * Realtime Chess Session stub.
 */
export class ChessRoom extends DurableObject {
  async fetch(request) {
    return new Response(JSON.stringify({ do: 'ChessRoom', ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/** Legacy KV-backed stubs to satisfy Cloudflare persistence migrations. */
export class IAMSession extends DurableObject {
  async fetch() { return new Response(JSON.stringify({ do: 'IAMSession', ok: true, legacy: true })); }
}
export class IAMAgentSession extends DurableObject {
  async fetch() { return new Response(JSON.stringify({ do: 'IAMAgentSession', ok: true, legacy: true })); }
}
export class MeauxSession extends DurableObject {
  async fetch() { return new Response(JSON.stringify({ do: 'MeauxSession', ok: true, legacy: true })); }
}
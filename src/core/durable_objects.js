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
    this.ptyWs = null;
    this.outputBuffer = [];
    this.connectPromise = null;
    this.lastThemeSlug = null;
    this.lastToken = null;
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

  _broadcastToBrowsers(data) {
    for (const ws of this.ctx.getWebSockets('browser')) {
      try { ws.send(data); } catch (_) {}
    }
  }

  _pushBuffer(data) {
    this.outputBuffer.push(data);
    if (this.outputBuffer.length > 800) this.outputBuffer.shift();
  }

  _resolveThemeSlug(url) {
    return url.searchParams.get('theme_slug') || url.searchParams.get('theme') || this.lastThemeSlug || 'meaux-storm-gray';
  }

  _resolveToken(url) {
    return url.searchParams.get('token') || this.lastToken || (this.env.TERMINAL_SECRET || '');
  }

  // ── PTY outbound connection ───────────────────────────────────────────────
  async _connectToPty(token, themeSlug) {
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this._connectToPtyInner(token, themeSlug).finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  async _connectToPtyInner(token, themeSlug) {
    const raw = (this.env.TERMINAL_WS_URL || '').trim();
    if (!raw) throw new Error('TERMINAL_WS_URL not configured');

    this.lastToken = token || null;
    this.lastThemeSlug = themeSlug || this.lastThemeSlug || 'meaux-storm-gray';

    let upstreamUrl = raw.trim();
    if (upstreamUrl.startsWith('wss://')) upstreamUrl = 'https://' + upstreamUrl.slice(6);
    else if (upstreamUrl.startsWith('ws://')) upstreamUrl = 'http://' + upstreamUrl.slice(5);
    else if (!upstreamUrl.startsWith('https://') && !upstreamUrl.startsWith('http://')) upstreamUrl = 'https://' + upstreamUrl.replace(/^\/+/, '');

    const sep = upstreamUrl.includes('?') ? '&' : '?';
    const ptyUrl = `${upstreamUrl}${sep}token=${encodeURIComponent(this.lastToken || '')}&theme_slug=${encodeURIComponent(this.lastThemeSlug)}`;

    const resp = await fetch(ptyUrl, {
      headers: {
        Upgrade: 'websocket', Connection: 'Upgrade',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
        'x-terminal-secret': this.env.TERMINAL_SECRET || '',
      },
    });
    if (resp.status !== 101 || !resp.webSocket) {
      throw new Error(`PTY connect failed: ${resp.status}`);
    }

    const pty = resp.webSocket;
    pty.accept();
    this.ptyWs = pty;

    this._broadcastToBrowsers(JSON.stringify({ type: 'pty_status', status: 'connected' }));

    pty.addEventListener('message', (evt) => {
      this._pushBuffer(evt.data);
      this._broadcastToBrowsers(evt.data);
    });

    const handleDisconnect = () => {
      this.ptyWs = null;
      this._broadcastToBrowsers(JSON.stringify({ type: 'pty_status', status: 'disconnected' }));
    };

    pty.addEventListener('close', handleDisconnect);
    pty.addEventListener('error', handleDisconnect);
  }

  // ── Browser WebSocket handler ─────────────────────────────────────────────
  async fetch(request) {
    const url = new URL(request.url);

    // Terminal WebSocket upgrade — browser connects here
    if (url.pathname === '/terminal/ws' || url.pathname === '/api/terminal/ws') {
      const token = this._resolveToken(url);
      const themeSlug = this._resolveThemeSlug(url);

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, ['browser']);

      for (const chunk of this.outputBuffer) {
        try { server.send(chunk); } catch (_) {}
      }

      try {
        if (!this.ptyWs || this.ptyWs.readyState > 1) {
          await this._connectToPty(token, themeSlug);
        }
        try { server.send(JSON.stringify({ type: 'pty_status', status: 'ready' })); } catch (_) {}
      } catch (e) {
        try {
          server.send(JSON.stringify({ type: 'pty_status', status: 'error', error: String(e?.message || e) }));
        } catch (_) {}
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/terminal/status') {
      return Response.json({
        ok: true,
        pty_connected: !!this.ptyWs && this.ptyWs.readyState === 1,
        buffered_chunks: this.outputBuffer.length,
        browser_clients: this.ctx.getWebSockets('browser').length,
        has_terminal_url: !!(this.env.TERMINAL_WS_URL || '').trim(),
        theme_slug: this.lastThemeSlug,
      });
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

  webSocketMessage(ws, message) {
    if (this.ptyWs?.readyState === 1) {
      this.ptyWs.send(message);
    }
  }

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
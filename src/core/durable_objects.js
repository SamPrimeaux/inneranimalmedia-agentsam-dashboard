/**
 * Core Layer: Durable Objects
 * Handles stateful collaborative sessions.
 */
import { DurableObject } from 'cloudflare:workers';
import { AgentChatSqlV1 } from '../do/AgentChat.js';

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
/** Legacy KV-backed stub (migration v3). */
export class IAMSession extends DurableObject {
  async fetch(request) {
    return new Response(JSON.stringify({ do: 'IAMSession', ok: true, legacy: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/** Stub for migration v4 class name; AGENT_SESSION uses AgentChatSqlV1. */
export class IAMAgentSession extends DurableObject {
  async fetch(request) {
    return new Response(JSON.stringify({ do: 'IAMAgentSession', ok: true, legacy: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/** Specialized stub for platform sessions. */
export class MeauxSession extends DurableObject {
  async fetch(request) {
    return new Response(JSON.stringify({ do: 'MeauxSession', ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/** Specialized stub for Chess logic. */
export class ChessRoom extends DurableObject {
  async fetch(request) {
    return new Response(JSON.stringify({ do: 'ChessRoom', ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

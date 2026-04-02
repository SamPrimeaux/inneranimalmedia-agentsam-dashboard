import { GoogleGenAI, Type } from "@google/genai";
import type { R2Bucket, D1Database, Fetcher, ExecutionContext, DurableObjectNamespace } from "@cloudflare/workers-types";
import { MeauxCADSession } from "./src/MeauxCADSession";
import { SHELL_VERSION } from "./src/shellVersion";

export interface Env {
  GEMINI_API_KEY: string;
  CAD_STORAGE: R2Bucket;
  PLATFORM_STORAGE: R2Bucket;
  /** CIDI sandbox dashboard assets (parity with inneranimal-dashboard R2 target). */
  SANDBOX: R2Bucket;
  SPLINEICONS_STORAGE: R2Bucket;
  /** Monaco / TOOLS mirror bucket (tools.inneranimalmedia.com). */
  TOOLS: R2Bucket;
  DB: D1Database;
  ASSETS: Fetcher;
  MCAD_SESSION: DurableObjectNamespace;
  INTERNAL_API_SECRET: string;
  MCP_AUTH_TOKEN: string;
}

const VERSION = SHELL_VERSION;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // ── IAM Standardized Routes (Handled Upstream) ──────────────────────────────
    // AI Chat and Models are handled by the primary IAM Worker to ensure 
    // automatic logging to ai_api_test_runs. Local handlers removed.

    // Spend / Telemetry Stubs
    if (url.pathname === '/api/spend/summary') {
      return new Response(JSON.stringify({ totalCount: 42 }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ── MeauxCAD Core Functional Routes ────────────────────────────────────────

    // Voxel Generation API
    if (request.method === 'POST' && url.pathname === '/api/generate') {
      try {
        const body = await request.json() as { prompt: string };
        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: 'gemini-1.5-flash',
          contents: body.prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  type: { type: Type.STRING },
                  position: {
                      type: Type.OBJECT,
                      properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER }, z: { type: Type.NUMBER } }
                  },
                  behavior: {
                      type: Type.OBJECT,
                      properties: { type: { type: Type.STRING }, mass: { type: Type.NUMBER } }
                  },
                  voxels: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: { x: { type: Type.INTEGER }, y: { type: Type.INTEGER }, z: { type: Type.INTEGER }, color: { type: Type.STRING } }
                    }
                  }
                },
                required: ["id", "name", "type", "voxels", "position", "behavior"]
              }
            }
          }
        });
        return new Response(JSON.stringify({ text: response.text }), { headers: { 'Content-Type': 'application/json' } });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
      }
    }

    // CAD Storage
    if (request.method === 'POST' && url.pathname.startsWith('/api/cad/upload/')) {
      const id = url.pathname.split('/').pop()!;
      await env.CAD_STORAGE.put(id, await request.text());
      return new Response(JSON.stringify({ success: true }));
    }
  
    if (request.method === 'GET' && url.pathname.startsWith('/api/cad/get/')) {
        const id = url.pathname.split('/').pop()!;
        const object = await env.CAD_STORAGE.get(id);
        if (!object) return new Response('Not found', { status: 404 });
        const headers = new Headers();
        object.writeHttpMetadata(headers as any);
        return new Response(object.body as any, { headers });
    }

    // Database Inspection
    if (request.method === 'GET' && url.pathname === '/api/db/tables') {
      const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
      return new Response(JSON.stringify({ success: true, tables: results.map((r: any) => r.name) }));
    }

    if (request.method === 'POST' && url.pathname === '/api/db/query') {
      const { sql, params } = await request.json() as { sql: string; params?: any[] };
      const { results, meta } = await env.DB.prepare(sql).bind(...(params || [])).all();
      return new Response(JSON.stringify({ success: true, results, meta }));
    }

    // System Version
    if (url.pathname === '/api/version') {
      return new Response(JSON.stringify({ version: VERSION, deployed_at: new Date().toISOString() }));
    }

    // ── Durable Object Session Routes ──────────────────────────────────────────
    if (url.pathname.startsWith('/api/session/')) {
      const workspaceId = url.pathname.split('/')[3];
      const doId = env.MCAD_SESSION.idFromName(workspaceId);
      const stub = env.MCAD_SESSION.get(doId);
      return stub.fetch(request);
    }

    // Fallback to static assets
    return env.ASSETS.fetch(request as any);
  }
};


export { MeauxCADSession };


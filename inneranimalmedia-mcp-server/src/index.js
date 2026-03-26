/**
 * Minimal MCP server skeleton for Cloudflare Workers.
 * Protocol: JSON-RPC 2.0 over HTTP; response as SSE line "data: <JSON>".
 * Auth: Bearer token via env.MCP_AUTH_TOKEN.
 */

const MCP_ROUTE = '/mcp';
const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'InnerAnimalMedia MCP';
const SERVER_VERSION = '1.1.0';
const RESEND_API = 'https://api.resend.com';

const IMPLEMENTED_TOOL_LIST = [
  { name: 'r2_write', description: 'Write a file to R2 storage', inputSchema: { type: 'object', properties: { key: { type: 'string' }, body: { type: 'string' } }, required: ['key', 'body'] } },
  { name: 'r2_read', description: 'Read an object from R2', inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } },
  { name: 'r2_list', description: 'List R2 objects with optional prefix', inputSchema: { type: 'object', properties: { prefix: { type: 'string' } } } },
  { name: 'd1_query', description: 'Run a SELECT query on D1', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'd1_write', description: 'Run an INSERT/UPDATE/DELETE on D1', inputSchema: { type: 'object', properties: { sql: { type: 'string' }, params: { type: 'array' } }, required: ['sql'] } },
  { name: 'terminal_execute', description: 'Execute a shell command', inputSchema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } },
  { name: 'list_clients', description: 'List clients from D1', inputSchema: { type: 'object' } },
  { name: 'get_worker_services', description: 'List Worker services for a client', inputSchema: { type: 'object', properties: { client_slug: { type: 'string' }, client_id: { type: 'string' } } } },
  { name: 'get_deploy_command', description: 'Get wrangler deploy command for a worker', inputSchema: { type: 'object', properties: { worker_name: { type: 'string' }, repo_path: { type: 'string' } }, required: ['worker_name'] } },
  { name: 'resend_send_email', description: 'Send a transactional email via Resend. Supports html/text body, cc, bcc, reply_to, idempotency_key for safe agent retries.', inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, subject: { type: 'string' }, html: { type: 'string' }, text: { type: 'string' }, cc: { type: 'string' }, bcc: { type: 'string' }, reply_to: { type: 'string' }, idempotency_key: { type: 'string' } }, required: ['from', 'to', 'subject'] } },
  { name: 'resend_list_domains', description: 'List all Resend domains and their verification status.', inputSchema: { type: 'object', properties: {} } },
  { name: 'resend_list_from_addresses', description: 'List verified from-addresses from the IAM resend_emails table. Filterable by domain, purpose, can_send.', inputSchema: { type: 'object', properties: { domain: { type: 'string' }, purpose: { type: 'string' }, can_send_only: { type: 'boolean' } } } },
  { name: 'resend_create_api_key', description: 'Create a scoped Resend API key per domain for CI pipeline isolation.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, permission: { type: 'string', enum: ['sending_access', 'full_access'] }, domain_id: { type: 'string' } }, required: ['name', 'permission'] } },
  { name: 'resend_send_broadcast', description: 'Send or schedule a Resend broadcast. scheduled_at accepts ISO 8601.', inputSchema: { type: 'object', properties: { broadcast_id: { type: 'string' }, scheduled_at: { type: 'string' } }, required: ['broadcast_id'] } },
];

const IMPLEMENTED_TOOLS = IMPLEMENTED_TOOL_LIST.map((t) => t.name);

function unauthorized(message) {
  return new Response(JSON.stringify({ error: 'Unauthorized', message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validateBearer(request, env) {
  const token = env.MCP_AUTH_TOKEN;
  if (!token) return unauthorized('MCP_AUTH_TOKEN not configured');
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return unauthorized('Missing or invalid Authorization header');
  const supplied = auth.slice(7).trim();
  if (supplied !== token) return unauthorized('Invalid token');
  return null;
}

function sseResponse(json) {
  return new Response('data: ' + JSON.stringify(json) + '\n\n', {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}

function textContent(text) {
  return { content: [{ type: 'text', text: String(text) }] };
}

function parseRecipients(val) {
  if (!val) return undefined;
  if (Array.isArray(val)) return val;
  const s = String(val).trim();
  try { const p = JSON.parse(s); if (Array.isArray(p)) return p; } catch (_) {}
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

async function resendFetch(env, method, path, body) {
  if (!env.RESEND_API_KEY) return { error: 'RESEND_API_KEY not configured as Worker secret' };
  const opts = { method, headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(RESEND_API + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.message || data.error || ('Resend API ' + res.status), raw: data };
    return { ok: true, data };
  } catch (e) { return { error: e?.message ?? String(e) }; }
}

async function invokeViaMainWorker(env, toolName, args) {
  const base = (env.MAIN_WORKER_BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');
  const token = env.MCP_AUTH_TOKEN;
  if (!token) return { errorText: 'MCP_AUTH_TOKEN not configured for proxy' };
  const res = await fetch(base + '/api/mcp/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + token, 'X-IAM-MCP-Proxy': '1' },
    body: JSON.stringify({ tool_name: toolName, params: args || {} }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 404) {
    const msg = String(data.error || '');
    if (/not found|not available/i.test(msg)) return { notImplemented: true };
    return { errorText: msg || 'invoke 404' };
  }
  if (!res.ok) return { errorText: String(data.error || data.detail || 'invoke failed ' + res.status) };
  if (data.error) return { errorText: String(data.error) };
  const r = data.result;
  if (typeof r === 'string') return { result: r };
  if (r == null) return { result: '' };
  try { return { result: JSON.stringify(r, null, 2) }; } catch (_) { return { result: String(r) }; }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    if (path === '/') {
      return new Response(JSON.stringify({ service: 'inneranimalmedia-mcp-server', status: 'ok', mcp_endpoint: MCP_ROUTE, auth: 'Bearer token required' }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (path === '/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok', service: 'inneranimalmedia-mcp', tools_implemented: IMPLEMENTED_TOOLS.length, tool_names: IMPLEMENTED_TOOLS, endpoint: 'https://mcp.inneranimalmedia.com/mcp', timestamp: Date.now() }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    if (path !== MCP_ROUTE) return new Response('Not Found', { status: 404 });
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    const accept = request.headers.get('Accept') || '';
    if (!accept.includes('application/json') && !accept.includes('text/event-stream')) {
      return new Response('Not Acceptable', { status: 406, headers: { 'Content-Type': 'text/plain' } });
    }

    const authError = validateBearer(request, env);
    if (authError) return authError;

    let body;
    try { body = await request.json(); } catch (_) {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const id = body.id;
    const method = body.method;
    const params = body.params || {};

    if (method === 'initialize') {
      return sseResponse({ jsonrpc: '2.0', id, result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } } });
    }

    if (method === 'tools/list') {
      return sseResponse({ jsonrpc: '2.0', id, result: { tools: IMPLEMENTED_TOOL_LIST } });
    }

    if (method === 'tools/call') {
      const name = params.name;
      const args = params.arguments || {};
      let result;

      try {
        if (name === 'r2_write') {
          if (!env.R2) { result = textContent('Error: R2 binding not configured.'); }
          else {
            const key = args.key || args.path;
            const bodyContent = args.body ?? args.content ?? '';
            if (!key) result = textContent('Error: key required');
            else { await env.R2.put(key, bodyContent, { httpMetadata: args.contentType ? { contentType: args.contentType } : undefined }); result = textContent('OK: wrote ' + key); }
          }
        } else if (name === 'r2_read') {
          if (!env.R2) result = textContent('Error: R2 binding not configured');
          else { const key = args.key || args.path; const obj = key ? await env.R2.get(key) : null; result = textContent(obj ? await obj.text() : 'Key not found: ' + (key || '')); }
        } else if (name === 'r2_list') {
          if (!env.R2) result = textContent('Error: R2 binding not configured');
          else { const list = await env.R2.list({ prefix: args.prefix || '', limit: 50 }); result = textContent(JSON.stringify(list.objects.map((o) => ({ key: o.key, size: o.size })))); }
        } else if (name === 'd1_query') {
          if (!env.DB) result = textContent('Error: DB binding not configured');
          else {
            const sql = (args.query || args.sql || '').trim();
            if (!/^\s*SELECT/i.test(sql)) result = textContent('Error: Only SELECT allowed via d1_query');
            else { const rows = await env.DB.prepare(sql).all(); result = textContent(JSON.stringify(rows.results ?? [])); }
          }
        } else if (name === 'd1_write') {
          if (!env.DB) result = textContent('Error: DB binding not configured');
          else {
            const sql = (args.sql || args.query || '').trim();
            const bindParams = Array.isArray(args.params) ? args.params : [];
            const stmt = env.DB.prepare(sql);
            const run = bindParams.length ? await stmt.bind(...bindParams).run() : await stmt.run();
            result = textContent(JSON.stringify({ changes: run.meta?.changes ?? run.changes ?? 0, success: true }));
          }
        } else if (name === 'terminal_execute') {
          const cmd = args.command || '';
          if (!env.PTY_AUTH_TOKEN) result = textContent('Error: terminal not configured (PTY_AUTH_TOKEN missing)');
          else {
            const res = await fetch('https://terminal.inneranimalmedia.com/exec', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.PTY_AUTH_TOKEN }, body: JSON.stringify({ command: cmd }) });
            const data = await res.json().catch(() => ({}));
            result = textContent((data.stdout || '') + (data.stderr ? '\nSTDERR: ' + data.stderr : '') || '(no output)');
          }
        } else if (name === 'list_clients') {
          if (!env.DB) result = textContent('Error: DB not configured');
          else { const r = await env.DB.prepare('SELECT id, display_name, slug, primary_email FROM clients ORDER BY display_name').all(); result = textContent(JSON.stringify(r.results ?? [], null, 2)); }
        } else if (name === 'get_worker_services') {
          if (!env.DB) result = textContent('Error: DB not configured');
          else if (args.client_id) { const r = await env.DB.prepare('SELECT worker_name, workers_dev_domain, notes FROM worker_services WHERE client_id = ? ORDER BY worker_name').bind(args.client_id).all(); result = textContent(JSON.stringify(r.results ?? [], null, 2)); }
          else if (args.client_slug) { const r = await env.DB.prepare('SELECT ws.worker_name, ws.workers_dev_domain, ws.notes FROM worker_services ws JOIN clients c ON c.id = ws.client_id WHERE c.slug = ? ORDER BY ws.worker_name').bind(args.client_slug).all(); result = textContent(JSON.stringify(r.results ?? [], null, 2)); }
          else result = textContent('Provide client_slug or client_id.');
        } else if (name === 'get_deploy_command') {
          if (!env.DB) result = textContent('Error: DB not configured');
          else { const r = await env.DB.prepare('SELECT worker_name FROM worker_services WHERE worker_name = ? LIMIT 1').bind(args.worker_name).all(); result = textContent(r.results?.[0] ? 'Deploy: npx wrangler deploy (from repo root).' : 'Worker not found: ' + args.worker_name); }

        } else if (name === 'resend_send_email') {
          const { from, to, subject, html, text, cc, bcc, reply_to, idempotency_key } = args;
          if (!from || !to || !subject) { result = textContent('Error: from, to, and subject are required.'); }
          else if (!env.RESEND_API_KEY) { result = textContent('Error: RESEND_API_KEY not configured as Worker secret.'); }
          else {
            const payload = { from, to: parseRecipients(to), subject };
            if (html) payload.html = html;
            if (text) payload.text = text;
            if (cc) payload.cc = parseRecipients(cc);
            if (bcc) payload.bcc = parseRecipients(bcc);
            if (reply_to) payload.reply_to = reply_to;
            const headers = { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' };
            if (idempotency_key) headers['Idempotency-Key'] = idempotency_key;
            const res = await fetch(RESEND_API + '/emails', { method: 'POST', headers, body: JSON.stringify(payload) });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
              if (env.DB) {
                try { await env.DB.prepare('INSERT OR IGNORE INTO email_logs (id, to_email, from_email, subject, status, resend_id, metadata, created_at, updated_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)').bind('elog_' + Date.now(), Array.isArray(payload.to) ? payload.to.join(',') : String(payload.to), from, subject, 'sent', data.id || null, JSON.stringify({ idempotency_key: idempotency_key || null })).run(); } catch (_) {}
              }
              result = textContent(JSON.stringify({ success: true, id: data.id, from, to: payload.to, subject }, null, 2));
            } else { result = textContent('Resend error: ' + JSON.stringify(data)); }
          }
        } else if (name === 'resend_list_domains') {
          const r = await resendFetch(env, 'GET', '/domains');
          if (r.error) result = textContent('Error: ' + r.error);
          else result = textContent(JSON.stringify((r.data?.data || []).map((d) => ({ id: d.id, name: d.name, status: d.status, region: d.region, created_at: d.created_at })), null, 2));
        } else if (name === 'resend_list_from_addresses') {
          if (!env.DB) result = textContent('Error: DB not configured');
          else {
            let sql = "SELECT id, address, label, purpose, domain, display_name, resend_domain_verified, can_send, can_receive, status FROM resend_emails WHERE status = 'active'";
            const binds = [];
            if (args.domain) { sql += ' AND domain = ?'; binds.push(args.domain); }
            if (args.purpose) { sql += ' AND purpose = ?'; binds.push(args.purpose); }
            if (args.can_send_only) sql += ' AND can_send = 1';
            sql += ' ORDER BY domain, local_part';
            const stmt = env.DB.prepare(sql);
            const r = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
            result = textContent(JSON.stringify(r.results ?? [], null, 2));
          }
        } else if (name === 'resend_create_api_key') {
          const { name: keyName, permission, domain_id } = args;
          if (!keyName || !permission) result = textContent('Error: name and permission are required.');
          else {
            const payload = { name: keyName, permission };
            if (domain_id) payload.domain_id = domain_id;
            const r = await resendFetch(env, 'POST', '/api-keys', payload);
            if (r.error) result = textContent('Error: ' + r.error);
            else result = textContent(JSON.stringify({ success: true, id: r.data.id, token: r.data.token }, null, 2));
          }
        } else if (name === 'resend_send_broadcast') {
          const { broadcast_id, scheduled_at } = args;
          if (!broadcast_id) result = textContent('Error: broadcast_id is required.');
          else if (scheduled_at) {
            const r = await resendFetch(env, 'POST', '/broadcasts/' + broadcast_id + '/schedule', { scheduled_at });
            if (r.error) result = textContent('Error: ' + r.error);
            else result = textContent(JSON.stringify({ success: true, scheduled_at, broadcast_id }, null, 2));
          } else {
            const r = await resendFetch(env, 'POST', '/broadcasts/' + broadcast_id + '/send', {});
            if (r.error) result = textContent('Error: ' + r.error);
            else result = textContent(JSON.stringify({ success: true, broadcast_id, sent: true }, null, 2));
          }
        } else {
          const proxied = await invokeViaMainWorker(env, name, args);
          if (proxied.notImplemented) return Response.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Tool not implemented: ' + name } });
          if (proxied.errorText) result = textContent(proxied.errorText);
          else result = textContent(proxied.result ?? '');
        }
      } catch (e) { result = textContent('Error: ' + (e?.message ?? String(e))); }

      return sseResponse({ jsonrpc: '2.0', id, result: { content: result.content, isError: false } });
    }

    return sseResponse({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } });
  },
};

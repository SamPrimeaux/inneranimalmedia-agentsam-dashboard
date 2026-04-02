/**
 * InnerAnimalMedia MCP server (Cloudflare Workers).
 * Protocol: JSON-RPC 2.0 over HTTP; SSE line "data: <JSON>".
 * Auth: Bearer env.MCP_AUTH_TOKEN.
 * Internal API calls to inneranimalmedia.com: header X-Ingest-Secret: env.INGEST_SECRET (when set).
 */

const MCP_ROUTE = '/mcp';
const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'InnerAnimalMedia MCP';
const SERVER_VERSION = '2.0.0';
const RESEND_API = 'https://api.resend.com';
const MAIN_DEFAULT = 'https://inneranimalmedia.com';
const REPO_CD = 'cd /Users/samprimeaux/Downloads/march1st-inneranimalmedia';

const IMPLEMENTED_TOOL_LIST = [
  { name: 'r2_write', description: 'Write bytes to R2 (iam-platform bucket)', inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'Object key path' }, body: { type: 'string' }, contentType: { type: 'string' } }, required: ['key', 'body'] } },
  { name: 'r2_read', description: 'Read an object from R2 (iam-platform)', inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } },
  { name: 'r2_list', description: 'List R2 objects under optional prefix', inputSchema: { type: 'object', properties: { prefix: { type: 'string' }, limit: { type: 'integer', default: 50 } } } },
  { name: 'r2_search', description: 'List objects with prefix, return keys containing query substring', inputSchema: { type: 'object', properties: { prefix: { type: 'string' }, query: { type: 'string' }, limit: { type: 'integer', default: 20 } }, required: ['query'] } },
  { name: 'r2_bucket_summary', description: 'Object counts for agent-sam, iam-platform, autorag, iam-docs', inputSchema: { type: 'object', properties: {} } },
  { name: 'r2_delete', description: 'Delete an R2 object (default bucket iam-platform)', inputSchema: { type: 'object', properties: { key: { type: 'string' }, bucket: { type: 'string', enum: ['iam-platform', 'agent-sam', 'autorag', 'iam-docs', 'inneranimalmedia-assets'] } }, required: ['key'] } },
  { name: 'd1_query', description: 'Run a read-only SELECT on D1', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'd1_write', description: 'Run INSERT/UPDATE/DELETE on D1', inputSchema: { type: 'object', properties: { sql: { type: 'string' }, params: { type: 'array' } }, required: ['sql'] } },
  { name: 'd1_schema_introspect', description: 'PRAGMA table_info for one table or all user tables', inputSchema: { type: 'object', properties: { table: { type: 'string' } } } },
  { name: 'd1_explain', description: 'EXPLAIN QUERY PLAN for a SELECT statement', inputSchema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] } },
  { name: 'd1_migrations_draft', description: 'Return a timestamped migration SQL stub filename and body', inputSchema: { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] } },
  { name: 'terminal_execute', description: 'Execute a shell command via PTY service', inputSchema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } },
  { name: 'list_clients', description: 'List clients from D1', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_worker_services', description: 'List worker_services for a client', inputSchema: { type: 'object', properties: { client_slug: { type: 'string' }, client_id: { type: 'string' } } } },
  { name: 'get_deploy_command', description: 'Confirm worker_name exists in worker_services', inputSchema: { type: 'object', properties: { worker_name: { type: 'string' }, repo_path: { type: 'string' } }, required: ['worker_name'] } },
  { name: 'resend_send_email', description: 'Send email via Resend API', inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, subject: { type: 'string' }, html: { type: 'string' }, text: { type: 'string' }, cc: { type: 'string' }, bcc: { type: 'string' }, reply_to: { type: 'string' }, idempotency_key: { type: 'string' } }, required: ['from', 'to', 'subject'] } },
  { name: 'resend_list_domains', description: 'List Resend domains', inputSchema: { type: 'object', properties: {} } },
  { name: 'resend_list_from_addresses', description: 'List resend_emails rows', inputSchema: { type: 'object', properties: { domain: { type: 'string' }, purpose: { type: 'string' }, can_send_only: { type: 'boolean' } } } },
  { name: 'resend_create_api_key', description: 'Create Resend API key', inputSchema: { type: 'object', properties: { name: { type: 'string' }, permission: { type: 'string', enum: ['sending_access', 'full_access'] }, domain_id: { type: 'string' } }, required: ['name', 'permission'] } },
  { name: 'resend_send_broadcast', description: 'Send or schedule Resend broadcast', inputSchema: { type: 'object', properties: { broadcast_id: { type: 'string' }, scheduled_at: { type: 'string' } }, required: ['broadcast_id'] } },
  { name: 'knowledge_search', description: 'POST /api/rag/query on main worker (X-Ingest-Secret)', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', default: 3 } }, required: ['query'] } },
  { name: 'browse_url', description: 'Headless browser fetch — text/screenshot/html/title', inputSchema: { type: 'object', properties: { url: { type: 'string' }, action: { type: 'string', enum: ['text', 'screenshot', 'html', 'title'], default: 'text' } }, required: ['url'] } },
  { name: 'rag_ingest', description: 'POST /api/rag/ingest on main worker', inputSchema: { type: 'object', properties: { object_key: { type: 'string' }, force: { type: 'boolean', default: false } }, required: ['object_key'] } },
  { name: 'rag_feedback', description: 'POST /api/rag/feedback', inputSchema: { type: 'object', properties: { search_history_id: { type: 'string' }, was_useful: { type: 'integer', enum: [0, 1] }, feedback_text: { type: 'string' } }, required: ['search_history_id', 'was_useful'] } },
  { name: 'rag_status', description: 'autorag index_status and chunk_count', inputSchema: { type: 'object', properties: { object_key: { type: 'string' } } } },
  { name: 'platform_info', description: 'project_memory rows for inneranimalmedia or one key', inputSchema: { type: 'object', properties: { key: { type: 'string' } } } },
  { name: 'agent_memory_search', description: 'Search agent_memory_index by value substring', inputSchema: { type: 'object', properties: { query: { type: 'string' }, memory_type: { type: 'string' } }, required: ['query'] } },
  { name: 'agent_memory_write', description: 'UPSERT project_memory key/value', inputSchema: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' }, importance_score: { type: 'number', default: 1.0 } }, required: ['key', 'value'] } },
  { name: 'telemetry_query', description: 'Recent agent_telemetry rows', inputSchema: { type: 'object', properties: { limit: { type: 'integer', default: 10 }, model_used: { type: 'string' }, provider: { type: 'string' } } } },
  { name: 'telemetry_stats', description: 'Aggregate agent_telemetry by model', inputSchema: { type: 'object', properties: {} } },
  { name: 'spend_summary', description: 'spend_ledger totals by provider', inputSchema: { type: 'object', properties: {} } },
  { name: 'worker_deploy', description: 'sandbox: deploy-sandbox.sh; production: promote-to-prod.sh (explicit env only)', inputSchema: { type: 'object', properties: { environment: { type: 'string', enum: ['sandbox', 'production'], default: 'sandbox' } } } },
  { name: 'deploy_status', description: 'Latest deployments rows', inputSchema: { type: 'object', properties: {} } },
  { name: 'benchmark_run', description: 'Run benchmark-full.sh sandbox or prod', inputSchema: { type: 'object', properties: { environment: { type: 'string', enum: ['sandbox', 'prod'], default: 'sandbox' } } } },
  { name: 'platform_info_full', description: 'Key deployment URLs and infra hints from project_memory', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_workers', description: 'Cloudflare Workers scripts for account', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_skills', description: 'Active agentsam_skill rows', inputSchema: { type: 'object', properties: {} } },
  { name: 'routing_rules', description: 'Active ai_routing_rules', inputSchema: { type: 'object', properties: {} } },
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
  try {
    const p = JSON.parse(s);
    if (Array.isArray(p)) return p;
  } catch (_) {}
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

function mainBase(env) {
  return (env.MAIN_WORKER_BASE_URL || MAIN_DEFAULT).replace(/\/$/, '');
}

function ingestHeaders(env, extra = {}) {
  const h = { 'Content-Type': 'application/json', Accept: 'application/json', ...extra };
  if (env.INGEST_SECRET) h['X-Ingest-Secret'] = env.INGEST_SECRET;
  return h;
}

async function mainWorkerPost(env, path, body) {
  const url = mainBase(env) + path;
  const res = await fetch(url, { method: 'POST', headers: ingestHeaders(env), body: JSON.stringify(body || {}) });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, data, hint: res.status === 401 ? 'Session or X-Ingest-Secret required on main worker for this route.' : undefined };
  }
  return { ok: true, data };
}

async function resendFetch(env, method, path, body) {
  if (!env.RESEND_API_KEY) return { error: 'RESEND_API_KEY not configured as Worker secret' };
  const opts = { method, headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(RESEND_API + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.message || data.error || 'Resend API ' + res.status, raw: data };
    return { ok: true, data };
  } catch (e) {
    return { error: e?.message ?? String(e) };
  }
}

function pickR2(env, bucketName) {
  const b = bucketName || 'iam-platform';
  if (b === 'iam-platform' || b === 'R2') return env.R2;
  if (b === 'agent-sam' || b === 'DASHBOARD') return env.DASHBOARD;
  if (b === 'autorag' || b === 'AUTORAG') return env.AUTORAG;
  if (b === 'iam-docs' || b === 'IAM_DOCS') return env.IAM_DOCS;
  if (b === 'inneranimalmedia-assets' || b === 'ASSETS') return env.ASSETS;
  return env.R2;
}

async function countR2Objects(binding, maxList = 100000) {
  if (!binding) return { count: 0, truncated: true, error: 'no binding' };
  let count = 0;
  let cursor;
  let truncated = false;
  do {
    const list = await binding.list({ limit: 1000, cursor });
    count += list.objects.length;
    if (count >= maxList) {
      truncated = true;
      break;
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  return { count, truncated };
}

async function invokeViaMainWorker(env, toolName, args) {
  const base = mainBase(env);
  const token = env.MCP_AUTH_TOKEN;
  if (!token) return { errorText: 'MCP_AUTH_TOKEN not configured for proxy' };
  const res = await fetch(base + '/api/mcp/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + token, 'X-IAM-MCP-Proxy': '1' },
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
  try {
    return { result: JSON.stringify(r, null, 2) };
  } catch (_) {
    return { result: String(r) };
  }
}

async function loadPromptsFromDb(env) {
  if (!env.DB) return [];
  try {
    const r = await env.DB.prepare(
      `SELECT slash_trigger, name, description, content_markdown FROM agentsam_skill WHERE is_active = 1 AND slash_trigger IS NOT NULL AND trim(slash_trigger) != '' ORDER BY sort_order ASC, name ASC`
    ).all();
    const rows = r.results ?? [];
    return rows.map((row) => {
      const n = String(row.slash_trigger || row.name).trim();
      return {
        name: n.startsWith('/') ? n : '/' + n,
        description: String(row.description || '').slice(0, 500),
        arguments: [{ name: 'input', description: 'user request', required: true }],
        _body: String(row.content_markdown || row.description || ''),
      };
    });
  } catch (e) {
    return [{ name: '_error', description: 'agentsam_skill query failed: ' + (e?.message || String(e)), arguments: [{ name: 'input', description: 'user request', required: true }], _body: '' }];
  }
}

async function handleToolCall(name, args, env) {
  let result;

  if (name === 'r2_write') {
    if (!env.R2) result = textContent('Error: R2 binding not configured.');
    else {
      const key = args.key || args.path;
      const bodyContent = args.body ?? args.content ?? '';
      if (!key) result = textContent('Error: key required');
      else {
        await env.R2.put(key, bodyContent, { httpMetadata: args.contentType ? { contentType: args.contentType } : undefined });
        result = textContent('OK: wrote ' + key);
      }
    }
  } else if (name === 'r2_read') {
    if (!env.R2) result = textContent('Error: R2 binding not configured');
    else {
      const key = args.key || args.path;
      const obj = key ? await env.R2.get(key) : null;
      result = textContent(obj ? await obj.text() : 'Key not found: ' + (key || ''));
    }
  } else if (name === 'r2_list') {
    if (!env.R2) result = textContent('Error: R2 binding not configured');
    else {
      const lim = Math.min(Number(args.limit) || 50, 1000);
      const list = await env.R2.list({ prefix: args.prefix || '', limit: lim });
      result = textContent(JSON.stringify(list.objects.map((o) => ({ key: o.key, size: o.size })), null, 2));
    }
  } else if (name === 'r2_search') {
    const bucket = pickR2(env, 'iam-platform');
    if (!bucket) result = textContent('Error: R2 binding not configured');
    else {
      const q = String(args.query || '');
      const lim = Math.min(Number(args.limit) || 20, 500);
      const pref = args.prefix || '';
      const out = [];
      let cursor;
      const needle = q.toLowerCase();
      do {
        const list = await bucket.list({ prefix: pref, limit: 1000, cursor });
        for (const o of list.objects) {
          if (o.key.toLowerCase().includes(needle)) out.push({ key: o.key, size: o.size });
          if (out.length >= lim) break;
        }
        if (out.length >= lim) break;
        cursor = list.truncated ? list.cursor : undefined;
      } while (cursor);
      result = textContent(JSON.stringify({ matches: out, count: out.length }, null, 2));
    }
  } else if (name === 'r2_bucket_summary') {
    const pairs = [
      ['agent-sam', env.DASHBOARD],
      ['iam-platform', env.R2],
      ['autorag', env.AUTORAG],
      ['iam-docs', env.IAM_DOCS],
    ];
    const summary = {};
    for (const [label, bind] of pairs) {
      if (!bind) summary[label] = { error: 'binding missing' };
      else {
        const c = await countR2Objects(bind);
        summary[label] = { object_count: c.count, truncated: c.truncated };
      }
    }
    result = textContent(JSON.stringify(summary, null, 2));
  } else if (name === 'r2_delete') {
    const bname = args.bucket || 'iam-platform';
    const bucket = pickR2(env, bname);
    const key = args.key;
    if (!key) result = textContent('Error: key required');
    else if (!bucket) result = textContent('Error: bucket binding not configured for ' + bname);
    else {
      await bucket.delete(key);
      result = textContent('OK: deleted ' + bname + '/' + key);
    }
  } else if (name === 'd1_query') {
    if (!env.DB) result = textContent('Error: DB binding not configured');
    else {
      const sql = (args.query || args.sql || '').trim();
      if (!/^\s*SELECT/i.test(sql)) result = textContent('Error: Only SELECT allowed via d1_query');
      else {
        const rows = await env.DB.prepare(sql).all();
        result = textContent(JSON.stringify(rows.results ?? [], null, 2));
      }
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
  } else if (name === 'd1_schema_introspect') {
    if (!env.DB) result = textContent('Error: DB binding not configured');
    else if (args.table) {
      const t = String(args.table).replace(/[^a-zA-Z0-9_]/g, '');
      const info = await env.DB.prepare(`PRAGMA table_info(${t})`).all();
      result = textContent(JSON.stringify({ table: t, columns: info.results ?? [] }, null, 2));
    } else {
      const tabs = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
      const names = (tabs.results ?? []).map((r) => r.name);
      const all = {};
      for (const n of names.slice(0, 200)) {
        const info = await env.DB.prepare(`PRAGMA table_info(${n})`).all();
        all[n] = info.results ?? [];
      }
      result = textContent(JSON.stringify({ tables: names.length, schema: all }, null, 2));
    }
  } else if (name === 'd1_explain') {
    if (!env.DB) result = textContent('Error: DB binding not configured');
    else {
      const sql = (args.sql || '').trim();
      if (!/^\s*SELECT/i.test(sql)) result = textContent('Error: d1_explain only supports SELECT');
      else {
        const plan = await env.DB.prepare('EXPLAIN QUERY PLAN ' + sql).all();
        result = textContent(JSON.stringify(plan.results ?? [], null, 2));
      }
    }
  } else if (name === 'd1_migrations_draft') {
    const desc = String(args.description || 'change').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'change';
    const d = new Date();
    const ts = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '').replace('T', '_');
    const fn = `migrations/${ts}_${desc}.sql`;
    const body =
      '-- ' +
      desc +
      '\n-- Database: inneranimalmedia-business\n-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./' +
      fn +
      '\n\n';
    result = textContent(JSON.stringify({ filename: fn, sql: body }, null, 2));
  } else if (name === 'terminal_execute') {
    const cmd = args.command || '';
    if (!env.PTY_AUTH_TOKEN) result = textContent('Error: terminal not configured (PTY_AUTH_TOKEN missing)');
    else {
      const res = await fetch('https://terminal.inneranimalmedia.com/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.PTY_AUTH_TOKEN },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json().catch(() => ({}));
      result = textContent((data.stdout || '') + (data.stderr ? '\nSTDERR: ' + data.stderr : '') || '(no output)');
    }
  } else if (name === 'list_clients') {
    if (!env.DB) result = textContent('Error: DB not configured');
    else {
      const r = await env.DB.prepare('SELECT id, display_name, slug, primary_email FROM clients ORDER BY display_name').all();
      result = textContent(JSON.stringify(r.results ?? [], null, 2));
    }
  } else if (name === 'get_worker_services') {
    if (!env.DB) result = textContent('Error: DB not configured');
    else if (args.client_id) {
      const r = await env.DB.prepare('SELECT worker_name, workers_dev_domain, notes FROM worker_services WHERE client_id = ? ORDER BY worker_name').bind(args.client_id).all();
      result = textContent(JSON.stringify(r.results ?? [], null, 2));
    } else if (args.client_slug) {
      const r = await env.DB.prepare('SELECT ws.worker_name, ws.workers_dev_domain, ws.notes FROM worker_services ws JOIN clients c ON c.id = ws.client_id WHERE c.slug = ? ORDER BY ws.worker_name').bind(args.client_slug).all();
      result = textContent(JSON.stringify(r.results ?? [], null, 2));
    } else result = textContent('Provide client_slug or client_id.');
  } else if (name === 'get_deploy_command') {
    if (!env.DB) result = textContent('Error: DB not configured');
    else {
      const r = await env.DB.prepare('SELECT worker_name FROM worker_services WHERE worker_name = ? LIMIT 1').bind(args.worker_name).all();
      result = textContent(r.results?.[0] ? 'Deploy: npx wrangler deploy (from repo root).' : 'Worker not found: ' + args.worker_name);
    }
  } else if (name === 'resend_send_email') {
    const { from, to, subject, html, text, cc, bcc, reply_to, idempotency_key } = args;
    if (!from || !to || !subject) result = textContent('Error: from, to, and subject are required.');
    else if (!env.RESEND_API_KEY) result = textContent('Error: RESEND_API_KEY not configured as Worker secret.');
    else {
      const payload = { from, to: parseRecipients(to), subject };
      if (html) payload.html = html;
      if (text) payload.text = text;
      if (cc) payload.cc = parseRecipients(cc);
      if (bcc) payload.bcc = parseRecipients(bcc);
      if (reply_to) payload.reply_to = reply_to;
      const headers = { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' };
      if (idempotency_key) headers['Idempotency-Key'] = idempotency_key;
      const res = await fetch(RESEND_API + '/emails', { method: 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (env.DB) {
          try {
            await env.DB.prepare(
              'INSERT OR IGNORE INTO email_logs (id, to_email, from_email, subject, status, resend_id, metadata, created_at, updated_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)'
            )
              .bind('elog_' + Date.now(), Array.isArray(payload.to) ? payload.to.join(',') : String(payload.to), from, subject, 'sent', data.id || null, JSON.stringify({ idempotency_key: idempotency_key || null }))
              .run();
          } catch (_) {}
        }
        result = textContent(JSON.stringify({ success: true, id: data.id, from, to: payload.to, subject }, null, 2));
      } else result = textContent('Resend error: ' + JSON.stringify(data));
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
      if (args.domain) {
        sql += ' AND domain = ?';
        binds.push(args.domain);
      }
      if (args.purpose) {
        sql += ' AND purpose = ?';
        binds.push(args.purpose);
      }
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
  } else if (name === 'knowledge_search') {
    const limit = Math.min(Number(args.limit) || 3, 20);
    const r = await mainWorkerPost(env, '/api/rag/query', { query: args.query, top_k: limit });
    if (!r.ok) result = textContent(JSON.stringify(r, null, 2));
    else result = textContent(JSON.stringify(r.data, null, 2));
  } else if (name === 'browse_url') {
    const browseUrl = String(args.url || '').trim();
    const browseAction = String(args.action || 'text').trim();
    if (!browseUrl) result = textContent('Error: url required');
    else {
      const r = await mainWorkerPost(env, '/api/agent/browse', { url: browseUrl, action: browseAction });
      if (!r.ok) result = textContent(JSON.stringify(r, null, 2));
      else result = textContent(JSON.stringify(r.data, null, 2));
    }
  } else if (name === 'rag_ingest') {
    const r = await mainWorkerPost(env, '/api/rag/ingest', { object_key: args.object_key, force: !!args.force });
    if (!r.ok) result = textContent(JSON.stringify(r, null, 2));
    else result = textContent(JSON.stringify(r.data, null, 2));
  } else if (name === 'rag_feedback') {
    const r = await mainWorkerPost(env, '/api/rag/feedback', {
      search_history_id: args.search_history_id,
      was_useful: args.was_useful,
      feedback_text: args.feedback_text,
    });
    if (!r.ok) result = textContent(JSON.stringify(r, null, 2));
    else result = textContent(JSON.stringify(r.data, null, 2));
  } else if (name === 'rag_status') {
    if (!env.DB) result = textContent('Error: DB not configured');
    else if (args.object_key) {
      const row = await env.DB.prepare('SELECT object_key, index_status, chunk_count, token_count, indexed_at FROM autorag WHERE object_key = ?').bind(args.object_key).first();
      result = textContent(JSON.stringify(row || { error: 'not found' }, null, 2));
    } else {
      const r = await env.DB.prepare(
        `SELECT object_key, index_status, chunk_count, token_count FROM autorag WHERE index_status IS NULL OR index_status != 'indexed' ORDER BY updated_at DESC LIMIT 100`
      ).all();
      result = textContent(JSON.stringify(r.results ?? [], null, 2));
    }
  } else if (name === 'platform_info') {
    if (!env.DB) result = textContent('Error: DB not configured');
    else if (args.key) {
      const row = await env.DB.prepare(`SELECT key, value, memory_type, importance_score FROM project_memory WHERE project_id = 'inneranimalmedia' AND key = ?`).bind(args.key).first();
      result = textContent(JSON.stringify(row || {}, null, 2));
    } else {
      const r = await env.DB.prepare(
        `SELECT key, value, memory_type, importance_score FROM project_memory WHERE project_id = 'inneranimalmedia' ORDER BY importance_score DESC LIMIT 15`
      ).all();
      result = textContent(JSON.stringify(r.results ?? [], null, 2));
    }
  } else if (name === 'agent_memory_search') {
    if (!env.DB) result = textContent('Error: DB not configured');
    else {
      const needle = String(args.query || '');
      let sql = 'SELECT id, memory_type, key, substr(value,1,2000) AS value_preview, importance_score FROM agent_memory_index WHERE instr(value, ?) > 0';
      const binds = [needle];
      if (args.memory_type) {
        sql += ' AND memory_type = ?';
        binds.push(args.memory_type);
      }
      sql += ' LIMIT 10';
      const r = await env.DB.prepare(sql).bind(...binds).all();
      result = textContent(JSON.stringify(r.results ?? [], null, 2));
    }
  } else if (name === 'agent_memory_write') {
    if (!env.DB) result = textContent('Error: DB not configured');
    else {
      const imp = Number(args.importance_score);
      const score = Number.isFinite(imp) ? imp : 1.0;
      await env.DB.prepare(
        `INSERT OR REPLACE INTO project_memory (project_id, tenant_id, memory_type, key, value, importance_score, confidence_score, created_by) VALUES ('inneranimalmedia', 'tenant_sam_primeaux', 'workflow', ?, ?, ?, 1.0, 'mcp')`
      )
        .bind(args.key, args.value, score)
        .run();
      result = textContent(JSON.stringify({ ok: true, key: args.key, importance_score: score }));
    }
  } else if (name === 'telemetry_query') {
    if (!env.DB) result = textContent('Error: DB not configured');
    else {
      const lim = Math.min(Number(args.limit) || 10, 200);
      let sql = 'SELECT id, model_used, provider, input_tokens, output_tokens, computed_cost_usd, created_at FROM agent_telemetry WHERE 1=1';
      const binds = [];
      if (args.model_used) {
        sql += ' AND model_used = ?';
        binds.push(args.model_used);
      }
      if (args.provider) {
        sql += ' AND provider = ?';
        binds.push(args.provider);
      }
      sql += ' ORDER BY created_at DESC LIMIT ?';
      binds.push(lim);
      const stmt = env.DB.prepare(sql);
      const r = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
      result = textContent(JSON.stringify(r.results ?? [], null, 2));
    }
  } else if (name === 'telemetry_stats') {
    if (!env.DB) result = textContent('Error: DB not configured');
    else {
      const r = await env.DB.prepare(
        `SELECT model_used, provider, COUNT(*) AS calls, COALESCE(SUM(computed_cost_usd),0) AS sum_cost_usd, COALESCE(AVG(input_tokens),0) AS avg_input_tokens FROM agent_telemetry GROUP BY model_used, provider ORDER BY sum_cost_usd DESC`
      ).all();
      result = textContent(JSON.stringify(r.results ?? [], null, 2));
    }
  } else if (name === 'spend_summary') {
    if (!env.DB) result = textContent('Error: DB not configured');
    else {
      const r = await env.DB.prepare(
        `SELECT provider, COALESCE(SUM(amount_usd),0) AS total_cost, COUNT(*) AS entries FROM spend_ledger GROUP BY provider ORDER BY total_cost DESC`
      ).all();
      result = textContent(JSON.stringify(r.results ?? [], null, 2));
    }
  } else if (name === 'worker_deploy') {
    const envName = String(args.environment || 'sandbox').toLowerCase();
    if (envName === 'production') {
      const cmd = REPO_CD + ' && ./scripts/promote-to-prod.sh';
      if (!env.PTY_AUTH_TOKEN) result = textContent('Error: PTY_AUTH_TOKEN missing');
      else {
        const res = await fetch('https://terminal.inneranimalmedia.com/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.PTY_AUTH_TOKEN },
          body: JSON.stringify({ command: cmd }),
        });
        const data = await res.json().catch(() => ({}));
        result = textContent('production promote:\n' + (data.stdout || '') + (data.stderr ? '\nSTDERR: ' + data.stderr : ''));
      }
    } else {
      const cmd = REPO_CD + ' && ./scripts/deploy-sandbox.sh';
      if (!env.PTY_AUTH_TOKEN) result = textContent('Error: PTY_AUTH_TOKEN missing');
      else {
        const res = await fetch('https://terminal.inneranimalmedia.com/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.PTY_AUTH_TOKEN },
          body: JSON.stringify({ command: cmd }),
        });
        const data = await res.json().catch(() => ({}));
        result = textContent('sandbox deploy:\n' + (data.stdout || '') + (data.stderr ? '\nSTDERR: ' + data.stderr : ''));
      }
    }
  } else if (name === 'deploy_status') {
    if (!env.DB) result = textContent('Error: DB not configured');
    else {
      const r = await env.DB.prepare(
        `SELECT id, version, status, description, created_at FROM deployments ORDER BY created_at DESC LIMIT 5`
      ).all();
      result = textContent(JSON.stringify(r.results ?? [], null, 2));
    }
  } else if (name === 'benchmark_run') {
    const envName = String(args.environment || 'sandbox').toLowerCase() === 'prod' ? 'prod' : 'sandbox';
    const cmd = REPO_CD + ' && ./scripts/benchmark-full.sh ' + envName;
    if (!env.PTY_AUTH_TOKEN) result = textContent('Error: PTY_AUTH_TOKEN missing');
    else {
      const res = await fetch('https://terminal.inneranimalmedia.com/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.PTY_AUTH_TOKEN },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json().catch(() => ({}));
      const out = (data.stdout || '') + (data.stderr ? '\nSTDERR: ' + data.stderr : '');
      const pass = (out.match(/\bPASS\b/g) || []).length;
      const fail = (out.match(/\bFAIL\b/g) || []).length;
      result = textContent(JSON.stringify({ stdout_excerpt: out.slice(0, 12000), pass_matches: pass, fail_matches: fail }, null, 2));
    }
  } else if (name === 'platform_info_full') {
    if (!env.DB) result = textContent('Error: DB not configured');
    else {
      const r = await env.DB.prepare(
        `SELECT key, value FROM project_memory WHERE project_id = 'inneranimalmedia' AND memory_type IN ('workflow','constraint') ORDER BY importance_score DESC LIMIT 25`
      ).all();
      result = textContent(JSON.stringify({ source: 'project_memory', rows: r.results ?? [] }, null, 2));
    }
  } else if (name === 'list_workers') {
    const aid = env.CLOUDFLARE_ACCOUNT_ID;
    const apit = env.CLOUDFLARE_API_TOKEN;
    if (!aid || !apit) result = textContent('Error: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN on the MCP worker (vars or secrets).');
    else {
      const res = await fetch('https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(aid) + '/workers/scripts', {
        headers: { Authorization: 'Bearer ' + apit, 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) result = textContent(JSON.stringify({ error: data.errors || data }, null, 2));
      else result = textContent(JSON.stringify(data.result ?? data, null, 2));
    }
  } else if (name === 'list_skills') {
    if (!env.DB) result = textContent('Error: DB not configured');
    else {
      const r = await env.DB.prepare(`SELECT name, slash_trigger, description FROM agentsam_skill WHERE is_active = 1 ORDER BY sort_order, name`).all();
      result = textContent(JSON.stringify(r.results ?? [], null, 2));
    }
  } else if (name === 'routing_rules') {
    if (!env.DB) result = textContent('Error: DB not configured');
    else {
      try {
        const r = await env.DB.prepare(
          `SELECT rule_name, match_value, target_model_key, fallback_model_key, target_provider, fallback_provider, priority FROM ai_routing_rules WHERE is_active = 1 ORDER BY priority ASC`
        ).all();
        result = textContent(JSON.stringify(r.results ?? [], null, 2));
      } catch (e) {
        const r2 = await env.DB.prepare(
          `SELECT rule_name, match_value, target_model_key, target_provider, priority FROM ai_routing_rules WHERE is_active = 1 ORDER BY priority ASC`
        ).all();
        result = textContent(JSON.stringify(r2.results ?? [], null, 2));
      }
    }
  } else {
    const proxied = await invokeViaMainWorker(env, name, args);
    if (proxied.notImplemented) throw new Error('TOOL_NOT_IMPLEMENTED');
    if (proxied.errorText) result = textContent(proxied.errorText);
    else result = textContent(proxied.result ?? '');
  }

  return result;
}

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    if (path === '/') {
      return new Response(JSON.stringify({ service: 'inneranimalmedia-mcp-server', status: 'ok', mcp_endpoint: MCP_ROUTE, auth: 'Bearer token required', version: SERVER_VERSION, tool_count: IMPLEMENTED_TOOLS.length }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (path === '/health' && request.method === 'GET') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'inneranimalmedia-mcp',
          tools_implemented: IMPLEMENTED_TOOLS.length,
          tool_names: IMPLEMENTED_TOOLS,
          endpoint: 'https://mcp.inneranimalmedia.com/mcp',
          timestamp: Date.now(),
        }),
        { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
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
    try {
      body = await request.json();
    } catch (_) {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const id = body.id;
    const method = body.method;
    const params = body.params || {};

    if (method === 'initialize') {
      return sseResponse({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      });
    }

    if (method === 'tools/list') {
      return sseResponse({ jsonrpc: '2.0', id, result: { tools: IMPLEMENTED_TOOL_LIST } });
    }

    if (method === 'prompts/list') {
      const raw = await loadPromptsFromDb(env);
      const prompts = raw.map((p) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments,
      }));
      return sseResponse({ jsonrpc: '2.0', id, result: { prompts } });
    }

    if (method === 'prompts/get') {
      const promptName = params.name || params.prompt;
      const argIn = (params.arguments && params.arguments.input) || '';
      const raw = await loadPromptsFromDb(env);
      const found = raw.find((p) => p.name === promptName || p.name === '/' + promptName || p.name.replace(/^\//, '') === String(promptName).replace(/^\//, ''));
      if (!found || found.name === '_error') {
        return sseResponse({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown prompt: ' + promptName } });
      }
      const bodyText = (found._body || found.description || '').slice(0, 8000) + (argIn ? '\n\nUser request:\n' + argIn : '');
      return sseResponse({
        jsonrpc: '2.0',
        id,
        result: {
          description: found.description,
          messages: [{ role: 'user', content: { type: 'text', text: bodyText } }],
        },
      });
    }

    if (method === 'tools/call') {
      const name = params.name;
      const args = params.arguments || {};
      let result;
      try {
        result = await handleToolCall(name, args, env);
      } catch (e) {
        if (e?.message === 'TOOL_NOT_IMPLEMENTED') {
          return sseResponse({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Tool not implemented: ' + name } });
        }
        result = textContent('Error: ' + (e?.message ?? String(e)));
      }
      return sseResponse({ jsonrpc: '2.0', id, result: { content: result.content, isError: false } });
    }

    if (method === 'ping') {
      return sseResponse({ jsonrpc: '2.0', id, result: {} });
    }

    return sseResponse({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } });
  },
};

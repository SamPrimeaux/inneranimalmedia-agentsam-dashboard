/**
 * Core Layer: Terminal Execution
 * Handles PTY workshops, WebSocket runs, and workspace path resolution.
 * Deconstructed from legacy worker.js.
 */
import { getAuthUser, tenantIdFromEnv } from './auth';
import { notifySam } from './notifications';

export const HEADLESS_TERMINAL_SESSION_ID = 'term_headless_sam';

/**
 * Merge WS frames from iam-pty run: JSON session_id/error/output, or raw PTY UTF-8.
 */
export function aggregateTerminalRunOutput(parts) {
  let out = '';
  for (const p of parts) {
    let s = p;
    if (typeof ArrayBuffer !== 'undefined' && s instanceof ArrayBuffer) {
      s = new TextDecoder().decode(s);
    } else if (typeof Uint8Array !== 'undefined' && s instanceof Uint8Array) {
      s = new TextDecoder().decode(s);
    } else if (typeof s !== 'string') {
      s = String(s);
    }
    const trimStart = s.trimStart();
    if (trimStart.startsWith('{')) {
      try {
        const j = JSON.parse(s);
        if (j && typeof j === 'object') {
          if (j.type === 'session_id') continue;
          if (j.type === 'output' && j.data != null) {
            out += typeof j.data === 'string' ? j.data : String(j.data);
            continue;
          }
          if (j.type === 'error' && j.data != null) {
            out += typeof j.data === 'string' ? j.data : String(j.data);
            continue;
          }
        }
      } catch (_) { /* not JSON; treat as PTY raw */ }
    }
    out += s;
  }
  return out.trim();
}

/**
 * Same host as TERMINAL_WS_URL: POST /exec (iam-pty server.js).
 */
export function terminalExecHttpUrlFromEnv(env) {
  const raw = (env.TERMINAL_WS_URL || '').trim().split('?')[0];
  if (!raw) return '';
  try {
    let u = raw;
    if (u.startsWith('wss://')) u = 'https://' + u.slice(6);
    else if (u.startsWith('ws://')) u = 'http://' + u.slice(7);
    else if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
    return new URL('/exec', new URL(u).origin).href;
  } catch (_) {
    return '';
  }
}

/**
 * Run via HTTP-exec (reliable fallback for Cloudflare Workers).
 */
export async function runTerminalCommandViaHttpExec(env, cmd) {
  const execUrl = terminalExecHttpUrlFromEnv(env);
  if (!execUrl) return { ok: false };
  const tokens = [];
  const pushTok = (t) => {
    const s = String(t || '').trim();
    if (s && !tokens.includes(s)) tokens.push(s);
  };
  pushTok(env.PTY_AUTH_TOKEN);
  pushTok(env.TERMINAL_SECRET);
  if (!tokens.length) return { ok: false };

  try {
    for (let i = 0; i < tokens.length; i++) {
      const bearer = tokens[i];
      const res = await fetch(execUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + bearer },
        body: JSON.stringify({ command: cmd }),
      });
      if (res.status === 401 && i < tokens.length - 1) continue;
      if (!res.ok) return { ok: false };
      
      const data = await res.json().catch(() => null);
      if (!data || typeof data !== 'object') return { ok: false };
      const stdout = typeof data.stdout === 'string' ? data.stdout : '';
      const stderr = typeof data.stderr === 'string' ? data.stderr : '';
      const text = ((stdout || '') + (stderr ? '\nSTDERR: ' + stderr : '')).trim();
      return { ok: true, text, exitCode: data.exit_code ?? 0 };
    }
    return { ok: false };
  } catch (e) {
    return { ok: false };
  }
}

/**
 * ACTIVE PATH: Execute through the authoritative Worker/DO control plane.
 * DEPRECATED DIRECT PATH: direct browser → upstream PTY websocket.
 */
export async function runTerminalCommandViaControlPlane(env, request, command, executionMode = 'pty', extra = {}) {
  if (!env?.AGENT_SESSION) return { ok: false };
  const cmd = typeof command === 'string' ? command.trim() : '';
  if (!cmd) return { ok: false, error: 'No command' };
  try {
    const authUser = await getAuthUser(request, env);
    const userId = String(authUser?.id || 'anonymous');
    const workspaceId = String(extra.workspace_id || authUser?.tenant_id || tenantIdFromEnv(env) || 'default').trim();
    const mode = ['pty', 'ssh', 'mcp'].includes(String(executionMode || '').toLowerCase())
      ? String(executionMode).toLowerCase()
      : 'pty';
    const sessionName = `terminal:${userId}:${workspaceId}:${mode}`;
    const doId = env.AGENT_SESSION.idFromName(sessionName);
    const stub = env.AGENT_SESSION.get(doId);
    const doUrl = new URL('https://do.internal/terminal/exec');
    doUrl.searchParams.set('execution_mode', mode);
    doUrl.searchParams.set('workspace_id', workspaceId);
    doUrl.searchParams.set('user_id', userId);
    const resp = await stub.fetch(new Request(doUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        command: cmd,
        execution_mode: mode,
        ssh_target_id: extra.ssh_target_id || null,
        tool_name: extra.tool_name || null,
        params: extra.params || null,
      }),
    }));
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok || payload?.ok === false) {
      return { ok: false, error: payload?.error || `control-plane ${resp.status}` };
    }
    return {
      ok: true,
      text: typeof payload?.output === 'string' ? payload.output : '',
      exitCode: payload?.exit_code ?? 0,
      toolName: payload?.tool_name ?? null,
      targetId: payload?.target_id ?? null,
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function writeTerminalHistory(env, request, sessionId, commandText, outputText, exitCode) {
  if (!env.DB) return;
  const terminalSessionId = await resolveTerminalSessionIdForHistory(env, request);
  const tenantId = tenantIdFromEnv(env);
  if (!terminalSessionId || !tenantId) return;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO terminal_history (id, terminal_session_id, tenant_id, direction, content, triggered_by, agent_session_id, recorded_at) VALUES (?,?,?,?,?,?,?,?)`
  ).bind('th_' + crypto.randomUUID().slice(0, 16), terminalSessionId, tenantId, 'input', commandText.slice(0, 5000), 'agent', sessionId, now).run();
  await env.DB.prepare(
    `INSERT INTO terminal_history (id, terminal_session_id, tenant_id, direction, content, exit_code, triggered_by, agent_session_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind('th_' + crypto.randomUUID().slice(0, 16), terminalSessionId, tenantId, 'output', outputText.slice(0, 10000), exitCode ?? null, 'agent', sessionId, now).run();
}

/**
 * Primary Execution Orchestrator.
 */
export async function runTerminalCommand(env, request, command, sessionId = null, executionCtx = null) {
  const cmd = typeof command === 'string' ? command.trim() : '';
  const mode = String(executionCtx?.execution_mode || 'pty').toLowerCase();
  const controlTry = await runTerminalCommandViaControlPlane(env, request, cmd, mode, executionCtx || {});
  if (controlTry.ok) {
    const cleanOutput = controlTry.text;
    const exitCode = controlTry.exitCode;
    await writeTerminalHistory(env, request, sessionId, cmd, cleanOutput, exitCode);
    return { output: cleanOutput, command: cmd, exitCode };
  }

  // Keep single control plane for all modes.
  if (mode !== 'pty' || env?.AGENT_SESSION) {
    throw new Error(controlTry.error || `${mode} execution unavailable`);
  }

  let wsUrl = (env.TERMINAL_WS_URL || '').trim();
  if (!wsUrl) throw new Error('Terminal not configured');

  const httpTry = await runTerminalCommandViaHttpExec(env, cmd);
  let cleanOutput = '';
  let exitCode;

  if (httpTry.ok) {
    cleanOutput = httpTry.text;
    exitCode = httpTry.exitCode;
  } else {
    // WebSocket Fallback Logic...
    if (wsUrl.startsWith('https://')) wsUrl = 'wss://' + wsUrl.slice(8);
    else if (wsUrl.startsWith('http://')) wsUrl = 'ws://' + wsUrl.slice(7);
    
    const sep = wsUrl.includes('?') ? '&' : '?';
    const token = String(env.PTY_AUTH_TOKEN || env.TERMINAL_SECRET || '').trim();
    const wsUrlWithAuth = token ? `${wsUrl}${sep}token=${encodeURIComponent(token)}` : wsUrl;
    
    const wsResp = await fetch(wsUrlWithAuth, {
      headers: { Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Version': '13' },
    });
    if (wsResp.status !== 101) throw new Error(`Terminal connect failed: ${wsResp.status}`);
    const ws = wsResp.webSocket;
    ws.accept();

    cleanOutput = await new Promise((resolve) => {
      const chunks = [];
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(aggregateTerminalRunOutput(chunks));
      };
      setTimeout(finish, 10000); // 10s ceiling
      ws.addEventListener('message', (e) => chunks.push(e.data));
      ws.addEventListener('close', finish);
      ws.send(JSON.stringify({ type: 'run', command: cmd }));
    });
    ws.close();
  }

  await writeTerminalHistory(env, request, sessionId, cmd, cleanOutput, exitCode);

  return { output: cleanOutput, command: cmd, exitCode };
}

export async function resolveIamWorkspaceRoot(env) {
  const fallback = '/Users/samprimeaux/Downloads/inneranimalmedia/inneranimalmedia-agentsam-dashboard';
  if (!env?.DB) return fallback;
  const row = await env.DB.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id = ?').bind('ws_inneranimalmedia').first();
  if (row?.settings_json) {
    const j = JSON.parse(row.settings_json);
    return j.workspace_root || fallback;
  }
  return fallback;
}

export async function resolveTerminalSessionIdForHistory(env, request) {
  try {
    const authUser = await getAuthUser(request, env);
    if (authUser?.id) {
       const tsRow = await env.DB.prepare(`SELECT id FROM terminal_sessions WHERE user_id = ? AND status = 'active' LIMIT 1`).bind(authUser.id).first();
       if (tsRow?.id) return tsRow.id;
    }
  } catch (_) {}
  await ensureHeadlessTerminalSessionForHistory(env);
  return HEADLESS_TERMINAL_SESSION_ID;
}

export async function ensureHeadlessTerminalSessionForHistory(env) {
  if (!env.DB) return;
  const tid = tenantIdFromEnv(env);
  if (!tid) return;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO terminal_sessions (id, tenant_id, user_id, status, shell, created_at, updated_at) VALUES (?, ?, 'headless_session', 'active', '/bin/zsh', unixepoch(), unixepoch())`
  ).bind(HEADLESS_TERMINAL_SESSION_ID, tid).run();
}

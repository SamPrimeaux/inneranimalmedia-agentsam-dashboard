/**
 * src/api/meet.js
 * Cloudflare Calls SFU proxy + room signaling + chat + invite
 */

import { jsonOk, jsonError, jsonNotFound } from '../core/responses.js';
import { requireAuth } from '../core/auth.js';

const CALLS_BASE = 'https://rtc.live.cloudflare.com/v1';
const TURN_BASE  = 'https://rtc.live.cloudflare.com/v1/turn/keys';

async function callsRequest(env, path, method = 'GET', body = null) {
  const url  = `${CALLS_BASE}/apps/${env.CLOUDFLARE_CALLS_APP_ID}${path}`;
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${env.CLOUDFLARE_CALLS_APP_SECRET}`,
      'Content-Type':  'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Calls API ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function upsertParticipant(db, { roomId, userId, displayName, sessionId, tracksJson }) {
  await db.prepare(`
    INSERT INTO meet_participants (room_id, user_id, display_name, session_id, tracks_json, joined_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(room_id, user_id) DO UPDATE SET
      session_id   = excluded.session_id,
      tracks_json  = excluded.tracks_json,
      display_name = excluded.display_name,
      last_seen_at = datetime('now')
  `).bind(roomId, userId, displayName, sessionId, tracksJson || '[]').run();
}

async function pruneStale(db, roomId) {
  await db.prepare(`
    DELETE FROM meet_participants
    WHERE room_id = ? AND last_seen_at < datetime('now', '-15 seconds')
  `).bind(roomId).run();
}

export async function handleMeetApi(request, env, ctx) {
  const url    = new URL(request.url);
  const parts  = url.pathname.replace('/api/meet', '').split('/').filter(Boolean);
  const method = request.method;

  const user = await requireAuth(request, env);
  if (!user) return jsonError('Unauthorized', 401);

  if (parts[0] === 'turn' && method === 'POST')
    return handleTurn(request, env, user);

  if (parts[0] === 'room' && !parts[1] && method === 'POST')
    return handleRoomJoin(request, env, user);

  if (parts[0] === 'room' && parts[1] && !parts[2] && method === 'GET')
    return handleRoomPoll(request, env, user, parts[1]);

  if (parts[0] === 'room' && parts[2] === 'session' && method === 'POST')
    return handleSession(request, env, user, parts[1]);

  if (parts[0] === 'room' && parts[2] === 'publish' && method === 'POST')
    return handlePublish(request, env, user, parts[1]);

  if (parts[0] === 'room' && parts[2] === 'subscribe' && method === 'POST')
    return handleSubscribe(request, env, user, parts[1]);

  if (parts[0] === 'room' && parts[2] === 'renegotiate' && method === 'POST')
    return handleRenegotiate(request, env, user, parts[1]);

  if (parts[0] === 'room' && parts[2] === 'heartbeat' && method === 'POST')
    return handleHeartbeat(request, env, user, parts[1]);

  if (parts[0] === 'room' && parts[2] === 'chat' && method === 'POST')
    return handleChat(request, env, user, parts[1]);

  if (parts[0] === 'room' && parts[2] === 'leave' && method === 'POST')
    return handleLeave(request, env, user, parts[1]);

  if (parts[0] === 'room' && parts[2] === 'invite' && method === 'POST')
    return handleInvite(request, env, user, parts[1]);

  return jsonNotFound('Meet endpoint not found');
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleTurn(request, env, user) {
  try {
    const tokenParts = (env.REALTIME_TURN_API_TOKEN || '').split(':');
    const keyId      = tokenParts[0];
    const keyToken   = tokenParts.slice(1).join(':');

    if (!keyId || !keyToken) {
      return jsonOk({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] });
    }

    // Correct CF endpoint: generate-ice-servers (not generate)
    const res = await fetch(`${TURN_BASE}/${keyId}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${keyToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ ttl: 86400 }),
    });

    if (!res.ok) {
      return jsonOk({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] });
    }

    const data = await res.json();
    // CF returns { iceServers: [...] } directly
    return jsonOk({ iceServers: data.iceServers });
  } catch {
    return jsonOk({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] });
  }
}

async function handleRoomJoin(request, env, user) {
  const body   = await request.json().catch(() => ({}));
  const roomId = body.roomId || crypto.randomUUID();
  const name   = body.name   || `Meeting ${new Date().toLocaleTimeString()}`;

  await env.DB.prepare(`
    INSERT INTO meet_rooms (id, name, created_by, created_at, status)
    VALUES (?, ?, ?, datetime('now'), 'active')
    ON CONFLICT(id) DO NOTHING
  `).bind(roomId, name, user.userId).run();

  return jsonOk({ roomId, name });
}

async function handleRoomPoll(request, env, user, roomId) {
  const db = env.DB;
  await pruneStale(db, roomId);

  const [participants, messages, room] = await Promise.all([
    db.prepare(`
      SELECT user_id, display_name, session_id, tracks_json, joined_at
      FROM meet_participants WHERE room_id = ?
    `).bind(roomId).all(),
    db.prepare(`
      SELECT id, user_id, display_name, content, created_at
      FROM meet_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 50
    `).bind(roomId).all(),
    db.prepare(`SELECT id, name, created_by FROM meet_rooms WHERE id = ?`).bind(roomId).first(),
  ]);

  if (!room) return jsonNotFound('Room not found');

  return jsonOk({
    room,
    participants: (participants.results || []).map(p => ({
      ...p, tracks: JSON.parse(p.tracks_json || '[]'),
    })),
    messages: (messages.results || []).reverse(),
  });
}

async function handleSession(request, env, user, roomId) {
  const body = await request.json().catch(() => ({}));
  const data = await callsRequest(env, '/sessions/new', 'POST');

  await upsertParticipant(env.DB, {
    roomId,
    userId:      user.userId,
    displayName: body.displayName || user.email || user.userId,
    sessionId:   data.sessionId,
    tracksJson:  '[]',
  });

  return jsonOk({ sessionId: data.sessionId });
}

async function handlePublish(request, env, user, roomId) {
  const body = await request.json();
  const { sessionId, offer, tracks } = body;
  if (!sessionId || !offer || !tracks?.length) return jsonError('sessionId, offer, tracks required', 400);

  const data = await callsRequest(env, `/sessions/${sessionId}/tracks/new`, 'POST', {
    sessionDescription: offer, tracks,
  });

  const trackNames = tracks.map(t => t.trackName);
  await env.DB.prepare(`
    UPDATE meet_participants SET tracks_json = ?, last_seen_at = datetime('now')
    WHERE room_id = ? AND user_id = ?
  `).bind(JSON.stringify(trackNames), roomId, user.userId).run();

  return jsonOk({ answer: data.sessionDescription, trackList: data.tracks });
}

async function handleSubscribe(request, env, user, roomId) {
  const body = await request.json();
  const { sessionId, remoteTracks } = body;
  if (!sessionId || !remoteTracks?.length) return jsonError('sessionId and remoteTracks required', 400);

  const data = await callsRequest(env, `/sessions/${sessionId}/tracks/new`, 'POST', {
    tracks: remoteTracks.map(t => ({
      location:  'remote',
      sessionId: t.sessionId,
      trackName: t.trackName,
    })),
  });

  if (data.requiresImmediateRenegotiation) {
    return jsonOk({ requiresRenegotiation: true, tracks: data.tracks });
  }
  return jsonOk({ answer: data.sessionDescription, tracks: data.tracks });
}

async function handleRenegotiate(request, env, user, roomId) {
  const body = await request.json();
  const { sessionId, offer } = body;
  if (!sessionId || !offer) return jsonError('sessionId and offer required', 400);

  const data = await callsRequest(env, `/sessions/${sessionId}/renegotiate`, 'PUT', {
    sessionDescription: offer,
  });
  return jsonOk({ answer: data.sessionDescription });
}

async function handleHeartbeat(request, env, user, roomId) {
  await env.DB.prepare(`
    UPDATE meet_participants SET last_seen_at = datetime('now')
    WHERE room_id = ? AND user_id = ?
  `).bind(roomId, user.userId).run();
  return jsonOk({ ok: true });
}

async function handleChat(request, env, user, roomId) {
  const body    = await request.json().catch(() => ({}));
  const content = (body.content || '').trim().slice(0, 2000);
  if (!content) return jsonError('content required', 400);

  const participant = await env.DB.prepare(`
    SELECT display_name FROM meet_participants WHERE room_id = ? AND user_id = ?
  `).bind(roomId, user.userId).first();

  const displayName = participant?.display_name || user.email || user.userId;

  await env.DB.prepare(`
    INSERT INTO meet_messages (id, room_id, user_id, display_name, content, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).bind(crypto.randomUUID(), roomId, user.userId, displayName, content).run();

  return jsonOk({ ok: true });
}

async function handleLeave(request, env, user, roomId) {
  await env.DB.prepare(`
    DELETE FROM meet_participants WHERE room_id = ? AND user_id = ?
  `).bind(roomId, user.userId).run();

  const { count } = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM meet_participants WHERE room_id = ?
  `).bind(roomId).first();

  if (count === 0) {
    await env.DB.prepare(`UPDATE meet_rooms SET status = 'ended' WHERE id = ?`)
      .bind(roomId).run();
  }
  return jsonOk({ ok: true });
}

async function handleInvite(request, env, user, roomId) {
  const body  = await request.json().catch(() => ({}));
  const email = (body.email || '').trim();
  const link  = (body.link  || '').trim();

  if (!email || !link) return jsonError('email and link required', 400);

  const room = await env.DB.prepare(`SELECT name FROM meet_rooms WHERE id = ?`).bind(roomId).first();
  const meetingName = room?.name || 'a meeting';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    'InnerAnimalMedia Meet <meet@inneranimalmedia.com>',
      to:      [email],
      subject: `You've been invited to ${meetingName}`,
      html: `
        <div style="font-family:monospace;background:#07100f;color:#c9d8d6;padding:32px;border-radius:12px;max-width:480px">
          <div style="color:#2dd4bf;font-weight:700;font-size:16px;margin-bottom:8px">InnerAnimalMedia</div>
          <h2 style="color:#e2efed;margin:0 0 12px">You're invited to join a meeting</h2>
          <p style="color:#6b9e99">${user.email || user.userId} has invited you to <strong style="color:#c9d8d6">${meetingName}</strong>.</p>
          <a href="${link}" style="display:inline-block;background:#2dd4bf;color:#07100f;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:12px">Join Meeting</a>
          <p style="color:#4a7a75;font-size:11px;margin-top:16px">Or copy this link: ${link}</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return jsonError(`Resend failed: ${err}`, 500);
  }

  return jsonOk({ ok: true });
}

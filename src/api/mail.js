/**
 * src/api/mail.js
 * Email client API (inbox, detail, templates, sending).
 *
 * All routes are auth-gated via getAuthUser.
 */

import { getAuthUser } from '../core/auth.js';
import { jsonResponse } from '../core/responses.js';

const PAGE_SIZE = 50;

function pathLower(url) {
  return url.pathname.toLowerCase().replace(/\/$/, '') || '/';
}

function parsePage(url) {
  const raw = url.searchParams.get('page');
  const n = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function safeJsonParse(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    const s = String(raw);
    if (!s.trim()) return null;
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function mustDb(env) {
  return !!env?.DB;
}

function replaceTemplateVars(template, vars) {
  const v = vars && typeof vars === 'object' ? vars : {};
  let out = String(template ?? '');
  for (const [k, val] of Object.entries(v)) {
    const key = String(k);
    const value = val == null ? '' : String(val);
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

export async function handleMailApi(request, url, env, ctx) {
  const p = pathLower(url);
  const method = request.method.toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!mustDb(env)) return jsonResponse({ error: 'DB not configured' }, 503);

  try {
    // GET /api/mail/inbox
    if (method === 'GET' && p === '/api/mail/inbox') {
      const page = parsePage(url);
      const offset = (page - 1) * PAGE_SIZE;
      const category = url.searchParams.get('category');
      const unread = url.searchParams.get('unread') === '1';

      const where = ['is_archived = 0'];
      const binds = [];
      if (category && category.trim()) {
        where.push('category = ?');
        binds.push(category.trim());
      }
      if (unread) where.push('is_read = 0');

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const [rows, totalRow, unreadRow] = await Promise.all([
        env.DB.prepare(
          `SELECT id, from_address, to_address, subject, date_received, is_read, is_starred, is_archived, category, has_attachments
           FROM received_emails
           ${whereSql}
           ORDER BY date_received DESC
           LIMIT ? OFFSET ?`
        ).bind(...binds, PAGE_SIZE, offset).all(),
        env.DB.prepare(
          `SELECT COUNT(*) as c FROM received_emails ${whereSql}`
        ).bind(...binds).first(),
        env.DB.prepare(
          `SELECT COUNT(*) as c FROM received_emails WHERE is_archived = 0 AND is_read = 0`
        ).first(),
      ]);

      return jsonResponse({
        emails: rows?.results || [],
        total: Number(totalRow?.c || 0),
        page,
        unread_count: Number(unreadRow?.c || 0),
      });
    }

    // GET /api/mail/starred
    if (method === 'GET' && p === '/api/mail/starred') {
      const { results } = await env.DB.prepare(
        `SELECT id, from_address, to_address, subject, date_received, is_read, is_starred, is_archived, category, has_attachments
         FROM received_emails
         WHERE is_starred = 1
         ORDER BY date_received DESC
         LIMIT 100`
      ).all();
      return jsonResponse({ emails: results || [] });
    }

    // GET /api/mail/archived
    if (method === 'GET' && p === '/api/mail/archived') {
      const page = parsePage(url);
      const offset = (page - 1) * PAGE_SIZE;
      const [rows, totalRow] = await Promise.all([
        env.DB.prepare(
          `SELECT id, from_address, to_address, subject, date_received, is_read, is_starred, is_archived, category, has_attachments
           FROM received_emails
           WHERE is_archived = 1
           ORDER BY date_received DESC
           LIMIT ? OFFSET ?`
        ).bind(PAGE_SIZE, offset).all(),
        env.DB.prepare(
          `SELECT COUNT(*) as c FROM received_emails WHERE is_archived = 1`
        ).first(),
      ]);

      return jsonResponse({
        emails: rows?.results || [],
        total: Number(totalRow?.c || 0),
        page,
      });
    }

    // GET /api/mail/sent
    if (method === 'GET' && p === '/api/mail/sent') {
      const { results } = await env.DB.prepare(
        `SELECT id,
                COALESCE(from_email, from_address) AS from_address,
                COALESCE(to_email, to_address) AS to_address,
                subject, status, created_at
         FROM email_logs
         WHERE status = 'sent'
         ORDER BY created_at DESC
         LIMIT 100`
      ).all();
      return jsonResponse({ emails: results || [] });
    }

    // GET /api/mail/email/:id
    if (method === 'GET' && p.startsWith('/api/mail/email/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop() || '').trim();
      if (!id) return jsonResponse({ error: 'Not found' }, 404);

      const email = await env.DB.prepare(
        `SELECT *
         FROM received_emails
         WHERE id = ?
         LIMIT 1`
      ).bind(id).first();

      if (!email) return jsonResponse({ error: 'Email not found' }, 404);

      // Mark read (non-blocking)
      await env.DB.prepare(
        `UPDATE received_emails
         SET is_read = 1, updated_at = datetime('now')
         WHERE id = ?`
      ).bind(id).run().catch(() => {});

      let body = null;
      const r2Key = email?.r2_key ? String(email.r2_key).trim() : '';
      const emailArchive = env.EMAIL || env.EMAIL_ARCHIVE;
      if (r2Key && emailArchive) {
        try {
          const obj = await emailArchive.get(r2Key);
          if (obj) {
            body = await obj.text();
          }
        } catch {
          body = null;
        }
      }

      const [attachmentsRows, threadRows] = await Promise.all([
        env.DB.prepare(
          `SELECT id, filename, content_type, size
           FROM email_attachments
           WHERE email_id = ?
           ORDER BY filename ASC`
        ).bind(id).all().catch(() => ({ results: [] })),
        email?.in_reply_to
          ? env.DB.prepare(
              `SELECT id, from_address, subject, date_received, is_read
               FROM received_emails
               WHERE message_id = ? OR in_reply_to = ?
               ORDER BY date_received ASC
               LIMIT 20`
            ).bind(String(email.in_reply_to), String(email.in_reply_to)).all().catch(() => ({ results: [] }))
          : Promise.resolve({ results: [] }),
      ]);

      const metadata = safeJsonParse(email?.metadata);

      return jsonResponse({
        email: { ...email, is_read: 1 },
        body,
        attachments: attachmentsRows?.results || [],
        thread: threadRows?.results || [],
        metadata,
      });
    }

    // GET /api/mail/templates
    if (method === 'GET' && p === '/api/mail/templates') {
      const { results } = await env.DB.prepare(
        `SELECT id, name, category, subject, variables, is_active
         FROM email_templates
         WHERE is_active = 1
         ORDER BY category, name`
      ).all();
      return jsonResponse({ templates: results || [] });
    }

    // GET /api/mail/senders
    if (method === 'GET' && p === '/api/mail/senders') {
      const { results } = await env.DB.prepare(
        `SELECT id, address, display_name, label, purpose
         FROM resend_emails
         WHERE status = 'active' AND can_send = 1
         ORDER BY purpose, address`
      ).all();
      return jsonResponse({ senders: results || [] });
    }

    // GET /api/mail/labels
    if (method === 'GET' && p === '/api/mail/labels') {
      const { results } = await env.DB.prepare(
        `SELECT label, COUNT(*) as count
         FROM email_labels
         GROUP BY label
         ORDER BY count DESC`
      ).all();
      return jsonResponse({ labels: results || [] });
    }

    // GET /api/mail/stats
    if (method === 'GET' && p === '/api/mail/stats') {
      const safeFirst = (q) => env.DB.prepare(q).first().catch(() => null);
      const safeAll = (q) => env.DB.prepare(q).all().catch(() => ({ results: [] }));

      const [totalRow, unreadRow, starredRow, categoriesRows] = await Promise.all([
        safeFirst(`SELECT COUNT(*) as c FROM received_emails WHERE is_archived = 0`),
        safeFirst(`SELECT COUNT(*) as c FROM received_emails WHERE is_read = 0 AND is_archived = 0`),
        safeFirst(`SELECT COUNT(*) as c FROM received_emails WHERE is_starred = 1`),
        safeAll(
          `SELECT category, COUNT(*) as count
           FROM received_emails
           WHERE is_archived = 0
           GROUP BY category`
        ),
      ]);

      return jsonResponse({
        total: Number(totalRow?.c || 0),
        unread: Number(unreadRow?.c || 0),
        starred: Number(starredRow?.c || 0),
        categories: categoriesRows?.results || [],
      });
    }

    // PATCH /api/mail/email/:id
    if (method === 'PATCH' && p.startsWith('/api/mail/email/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop() || '').trim();
      if (!id) return jsonResponse({ error: 'Not found' }, 404);

      const body = await readJsonBody(request);
      if (!body || typeof body !== 'object') return jsonResponse({ error: 'Invalid JSON body' }, 400);

      const allowed = ['is_read', 'is_starred', 'is_archived', 'category'];
      const sets = [];
      const binds = [];
      for (const k of allowed) {
        if (!(k in body)) continue;
        sets.push(`${k} = ?`);
        binds.push(body[k]);
      }

      if (sets.length === 0) {
        return jsonResponse({ ok: true });
      }

      sets.push(`updated_at = datetime('now')`);

      await env.DB.prepare(
        `UPDATE received_emails
         SET ${sets.join(', ')}
         WHERE id = ?`
      ).bind(...binds, id).run();

      return jsonResponse({ ok: true });
    }

    // POST /api/mail/label
    if (method === 'POST' && p === '/api/mail/label') {
      const body = await readJsonBody(request);
      const emailId = body?.email_id ? String(body.email_id).trim() : '';
      const label = body?.label ? String(body.label).trim() : '';
      if (!emailId || !label) return jsonResponse({ error: 'email_id and label required' }, 400);

      await env.DB.prepare(
        `INSERT OR IGNORE INTO email_labels (id, email_id, label, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, datetime('now'))`
      ).bind(emailId, label).run();

      return jsonResponse({ ok: true });
    }

    // DELETE /api/mail/label
    if (method === 'DELETE' && p === '/api/mail/label') {
      const body = await readJsonBody(request);
      const emailId = body?.email_id ? String(body.email_id).trim() : '';
      const label = body?.label ? String(body.label).trim() : '';
      if (!emailId || !label) return jsonResponse({ error: 'email_id and label required' }, 400);

      await env.DB.prepare(
        `DELETE FROM email_labels WHERE email_id = ? AND label = ?`
      ).bind(emailId, label).run();

      return jsonResponse({ ok: true });
    }

    // POST /api/mail/send
    if (method === 'POST' && p === '/api/mail/send') {
      const body = await readJsonBody(request);
      const from = body?.from ? String(body.from).trim() : '';
      const to = body?.to ? String(body.to).trim() : '';
      const subjectRaw = body?.subject != null ? String(body.subject) : '';
      const subject = subjectRaw.trim();

      if (!from || !to || !subject) {
        return jsonResponse({ error: 'from, to, subject are required' }, 400);
      }

      let html = body?.html != null ? String(body.html) : '';
      let text = body?.text != null ? String(body.text) : '';
      const templateId = body?.template_id ? String(body.template_id).trim() : '';
      const vars = body?.vars && typeof body.vars === 'object' ? body.vars : {};
      const replyTo = body?.reply_to ? String(body.reply_to).trim() : '';

      if (templateId) {
        const tpl = await env.DB.prepare(
          `SELECT html_content, text_content FROM email_templates WHERE id = ? LIMIT 1`
        ).bind(templateId).first();
        if (tpl) {
          html = replaceTemplateVars(tpl.html_content, vars);
          text = replaceTemplateVars(tpl.text_content, vars);
        }
      } else {
        html = replaceTemplateVars(html, vars);
        text = replaceTemplateVars(text, vars);
      }

      if (!env.RESEND_API_KEY) return jsonResponse({ error: 'RESEND_API_KEY not configured' }, 503);

      const payload = {
        from,
        to,
        subject,
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
      };

      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = typeof data?.message === 'string' ? data.message : 'Failed to send email';
        return jsonResponse({ error: msg }, 502);
      }

      const resendId = typeof data?.id === 'string' && data.id.trim() ? data.id.trim() : (crypto?.randomUUID?.() || 'sent');
      const logId = crypto.randomUUID();
      const archive = env.EMAIL || env.EMAIL_ARCHIVE;
      const archivePayload = JSON.stringify({
        id: logId,
        resend_id: resendId,
        from,
        to,
        subject,
        html: html || null,
        text: text || null,
        sent_at: new Date().toISOString(),
      });

      try {
        const ins = await env.DB.prepare(
          `INSERT INTO email_logs (id, to_email, from_email, subject, status, resend_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'sent', ?, datetime('now'), datetime('now'))`,
        ).bind(logId, to, from, subject, resendId).run();
        if (!(ins.meta?.changes > 0)) {
          console.warn('[mail/send] email_logs insert reported 0 changes');
        }
      } catch (e) {
        console.warn('[mail/send] email_logs insert failed', e?.message ?? e);
      }

      if (archive) {
        try {
          await archive.put(`sent/${logId}.json`, archivePayload, {
            httpMetadata: { contentType: 'application/json' },
          });
        } catch (e) {
          console.warn('[mail/send] R2 archive put failed', e?.message ?? e);
        }
      }

      return jsonResponse({ ok: true, id: resendId, log_id: logId });
    }

    // POST /api/mail/draft
    if (method === 'POST' && p === '/api/mail/draft') {
      const body = await readJsonBody(request);
      const from = body?.from != null ? String(body.from).trim() : '';
      const to = body?.to != null ? String(body.to).trim() : '';
      const subject = body?.subject != null ? String(body.subject).trim() : '';

      // Prefer SQL-generated id with RETURNING; fallback to crypto.randomUUID for compatibility.
      let id = null;
      try {
        const row = await env.DB.prepare(
          `INSERT INTO email_logs (id, to_email, from_email, subject, status, created_at, updated_at)
           VALUES (lower(hex(randomblob(16))), ?, ?, ?, 'draft', datetime('now'), datetime('now'))
           RETURNING id`
        ).bind(to, from, subject).first();
        id = row?.id ? String(row.id) : null;
      } catch {
        id = crypto?.randomUUID?.() || String(Date.now());
        await env.DB.prepare(
          `INSERT INTO email_logs (id, to_email, from_email, subject, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'draft', datetime('now'), datetime('now'))`
        ).bind(id, to, from, subject).run();
      }

      return jsonResponse({ ok: true, id });
    }

    // DELETE /api/mail/email/:id (soft delete -> archive)
    if (method === 'DELETE' && p.startsWith('/api/mail/email/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop() || '').trim();
      if (!id) return jsonResponse({ error: 'Not found' }, 404);

      await env.DB.prepare(
        `UPDATE received_emails
         SET is_archived = 1, updated_at = datetime('now')
         WHERE id = ?`
      ).bind(id).run();

      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Mail route not found', path: url.pathname }, 404);
  } catch (e) {
    return jsonResponse({ error: String(e?.message || e) }, 500);
  }
}


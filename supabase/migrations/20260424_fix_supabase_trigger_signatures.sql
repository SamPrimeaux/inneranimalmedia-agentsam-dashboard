-- Supabase migration: fix webhook signing to match Cloudflare Worker verifier
--
-- Worker expects:
--   x-supabase-signature: sha256=<hex>
-- where <hex> is HMAC-SHA256(raw_body, key=secret_utf8).
--
-- These functions POST JSON payloads to the IAM worker and sign the *raw payload*
-- with the secret stored in public.webhook_secrets.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.trigger_rag_ingest()
returns trigger
language plpgsql
security definer
as $$
declare
  _secret text;
  _payload text;
  _sig text;
begin
  select secret into _secret from public.webhook_secrets where name = 'iam-context-reindex';

  _payload := json_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'record', row_to_json(NEW)
  )::text;

  _sig := 'sha256=' || encode(
    extensions.hmac(_payload::bytea, _secret::bytea, 'sha256'),
    'hex'
  );

  perform supabase_functions.http_request(
    'https://inneranimalmedia.com/api/rag/ingest',
    'POST',
    json_build_object(
      'Content-Type', 'application/json',
      'x-supabase-signature', _sig
    )::text,
    _payload,
    '5000'
  );

  return NEW;
exception when others then
  return NEW;
end;
$$;

create or replace function public.trigger_agent_memory_sync()
returns trigger
language plpgsql
security definer
as $$
declare
  _secret text;
  _payload text;
  _sig text;
begin
  select secret into _secret from public.webhook_secrets where name = 'iam-context-reindex';

  _payload := json_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'record', row_to_json(NEW)
  )::text;

  _sig := 'sha256=' || encode(
    extensions.hmac(_payload::bytea, _secret::bytea, 'sha256'),
    'hex'
  );

  perform supabase_functions.http_request(
    'https://inneranimalmedia.com/api/agent/memory/sync',
    'POST',
    json_build_object(
      'Content-Type', 'application/json',
      'x-supabase-signature', _sig
    )::text,
    _payload,
    '5000'
  );

  return NEW;
exception when others then
  return NEW;
end;
$$;


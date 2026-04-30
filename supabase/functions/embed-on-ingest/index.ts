import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CF_ACCOUNT_ID  = Deno.env.get('CF_ACCOUNT_ID')!
const CF_AI_TOKEN    = Deno.env.get('CF_AI_TOKEN')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')!
const EMBED_MODEL    = '@cf/baai/bge-large-en-v1.5'

Deno.serve(async (req) => {
  const signature = req.headers.get('x-supabase-signature') ?? ''
  const rawBody   = await req.text()
  const expected  = 'sha256=' + await hmacHex(rawBody, WEBHOOK_SECRET)

  if (signature !== expected) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { table, type, record } = JSON.parse(rawBody)

  if (!['INSERT', 'UPDATE'].includes(type)) {
    return new Response('skipped', { status: 200 })
  }

  // Already embedded — skip to prevent loops
  if (record.embedding !== null) {
    return new Response('already embedded', { status: 200 })
  }

  const text = record.content?.trim()
  if (!text) return new Response('no content', { status: 200 })

  // Generate embedding via CF Workers AI REST API
  const embedRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${EMBED_MODEL}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_AI_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    }
  )

  if (!embedRes.ok) {
    console.error('CF Workers AI failed:', await embedRes.text())
    return new Response('embed failed', { status: 500 })
  }

  const { result } = await embedRes.json()
  const embedding: number[] = result.data[0]

  // Write embedding back
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const { error } = await supabase
    .from(table)
    .update({ embedding: JSON.stringify(embedding) })
    .eq('id', record.id)

  if (error) {
    console.error('Write-back failed:', error)
    return new Response('write failed', { status: 500 })
  }

  // Log delivery
  await supabase.from('webhook_delivery_attempts').insert({
    schema_name: 'public',
    table_name: table,
    operation: type,
    status: 'embedded',
    http_status: 200,
    payload: JSON.parse(rawBody)
  })

  return new Response(JSON.stringify({ ok: true, table, id: record.id }), {
    headers: { 'Content-Type': 'application/json' }
  })
})

async function hmacHex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}

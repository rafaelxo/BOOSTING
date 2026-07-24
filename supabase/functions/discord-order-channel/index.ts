import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { z } from 'https://esm.sh/zod@3.23.8'
import { constantTimeEqual } from '../_shared/crypto.ts'
import { jsonResponse } from '../_shared/responses.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { fetchWithTimeout, HttpError, readJsonBody } from '../_shared/http.ts'
import { consumeUserRateLimit } from '../_shared/rateLimit.ts'
import { rateLimitResponse } from '../_shared/responses.ts'

const DISCORD_API     = 'https://discord.com/api/v10'
const BOT_TOKEN       = Deno.env.get('DISCORD_BOT_TOKEN')       ?? ''
const GUILD_ID        = Deno.env.get('DISCORD_GUILD_ID')        ?? ''
const ADMIN_ROLE_ID   = Deno.env.get('DISCORD_ADMIN_ROLE_ID')   ?? ''
const CATEGORY_ID     = Deno.env.get('DISCORD_CATEGORY_BOOSTS') ?? ''
const WEBHOOK_SECRET  = Deno.env.get('DISCORD_WEBHOOK_SECRET')  ?? ''

// Bit flags: VIEW_CHANNEL (1024) + CONNECT (1048576) + SPEAK (2097152)
const VOICE_ALLOW    = String(1024 + 1048576 + 2097152)
const DENY_EVERYONE  = String(1024) // deny VIEW_CHANNEL for @everyone

const TERMINAL = ['completed', 'canceled', 'refunded', 'disputed', 'drop_requested']

const orderRecordSchema = z.object({
  id: z.string().uuid(),
  status: z.string().min(1),
  discord_voice_channel_id: z.string().nullable().optional(),
}).passthrough()

const dbWebhookSchema = z.union([
  orderRecordSchema,
  z.object({
    record: orderRecordSchema,
    old_record: z.object({ status: z.string().optional() }).passthrough().optional(),
  }).passthrough(),
])

async function fetchOrderProfiles(orderId: string) {
  const db = supabaseAdmin()

  const { data: order, error } = await db
    .from('orders')
    .select('id, status, customer_id, assigned_booster_id, service_id, discord_voice_channel_id')
    .eq('id', orderId)
    .single()

  if (error || !order) throw new Error('Order not found')

  const ids = [order.customer_id, order.assigned_booster_id].filter(Boolean)
  const { data: profiles } = await db
    .from('profiles')
    .select('id, username, discord_id')
    .in('id', ids)

  return {
    order,
    customer: profiles?.find(p => p.id === order.customer_id) ?? null,
    booster:  profiles?.find(p => p.id === order.assigned_booster_id) ?? null,
  }
}

async function createVoiceChannel(orderId: string, customerDiscordId: string | null, boosterDiscordId: string | null) {
  const shortId = orderId.slice(0, 8)

  const overwrites: object[] = [
    { id: GUILD_ID, type: 0, deny: DENY_EVERYONE }, // block @everyone
  ]

  if (customerDiscordId) overwrites.push({ id: customerDiscordId, type: 1, allow: VOICE_ALLOW })
  if (boosterDiscordId)  overwrites.push({ id: boosterDiscordId,  type: 1, allow: VOICE_ALLOW })
  if (ADMIN_ROLE_ID)     overwrites.push({ id: ADMIN_ROLE_ID,     type: 0, allow: VOICE_ALLOW })

  const body: Record<string, unknown> = {
    name: `boost-${shortId}`,
    type: 2, // voice channel
    permission_overwrites: overwrites,
  }
  if (CATEGORY_ID) body.parent_id = CATEGORY_ID

  const res = await fetchWithTimeout(`${DISCORD_API}/guilds/${GUILD_ID}/channels`, {
    method: 'POST',
    headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    console.error(`Discord create channel failed ${res.status}:`, await res.text())
    throw new Error(`Discord create channel ${res.status}`)
  }
  const channel = await res.json() as { id: string }
  return channel.id
}

async function deleteVoiceChannel(channelId: string) {
  const res = await fetchWithTimeout(`${DISCORD_API}/channels/${channelId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
  })
  // 404 = already deleted, that's fine
  if (!res.ok && res.status !== 404) {
    console.error(`Discord delete channel failed ${res.status}:`, await res.text())
    throw new Error(`Discord delete channel ${res.status}`)
  }
}

async function saveChannelId(orderId: string, channelId: string | null) {
  await supabaseAdmin()
    .from('orders')
    .update({ discord_voice_channel_id: channelId })
    .eq('id', orderId)
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  if (!WEBHOOK_SECRET) {
    return new Response('Server misconfigured', { status: 500 })
  }

  if (!BOT_TOKEN || !GUILD_ID) {
    return new Response('Server misconfigured', { status: 500 })
  }

  const receivedSecret = req.headers.get('x-webhook-secret') ?? ''
  if (!constantTimeEqual(receivedSecret, WEBHOOK_SECRET)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const rateLimit = await consumeUserRateLimit('discord-order-channel', 'database-webhook', 120, 60)
  if (!rateLimit.allowed) return rateLimitResponse(req, rateLimit.retryAfter)

  let rawPayload: unknown
  try {
    rawPayload = await readJsonBody(req, 32 * 1024)
  } catch (err) {
    if (err instanceof HttpError) return jsonResponse(req, { error: err.message }, err.status)
    return jsonResponse(req, { error: 'invalid request' }, 400)
  }

  const parsedPayload = dbWebhookSchema.safeParse(rawPayload)
  if (!parsedPayload.success) {
    return jsonResponse(req, { error: 'invalid webhook payload' }, 400)
  }

  // Supabase Database Webhooks wrap the row in { type, table, record, old_record }
  const payload = parsedPayload.data
  const record = 'record' in payload ? payload.record : payload
  const oldRecord = 'record' in payload ? payload.old_record ?? {} : {}

  const orderId:           string        = record.id
  const newStatus:         string        = record.status
  const oldStatus:         string        = oldRecord.status ?? ''
  const existingChannelId: string | null = record.discord_voice_channel_id ?? null

  try {
    // ── Create channel when order goes in_progress ───────────────────────────
    if (newStatus === 'in_progress' && oldStatus !== 'in_progress' && !existingChannelId) {
      const { order, customer, booster } = await fetchOrderProfiles(orderId)

      // O payload do webhook não é reconferido contra o banco em nenhum outro
      // ponto — sem isso, a posse do DISCORD_WEBHOOK_SECRET (compartilhado com
      // discord-init-channels) seria suficiente pra forjar `status` e criar/
      // apagar canais fora de sincronia com o estado real do pedido.
      if (order.status !== 'in_progress') {
        return jsonResponse(req, { ok: false, reason: 'order status mismatch, ignoring stale/forged payload' })
      }

      if (!customer?.discord_id && !booster?.discord_id) {
        return jsonResponse(req, { ok: false, reason: 'no discord_ids found for customer or booster' })
      }

      const channelId = await createVoiceChannel(
        order.id,
        customer?.discord_id ?? null,
        booster?.discord_id  ?? null,
      )
      await saveChannelId(orderId, channelId)

      return jsonResponse(req, { ok: true, action: 'created', channelId })
    }

    // ── Delete channel when order is terminated ──────────────────────────────
    if (TERMINAL.includes(newStatus) && existingChannelId) {
      const { order } = await fetchOrderProfiles(orderId)
      if (!TERMINAL.includes(order.status)) {
        return jsonResponse(req, { ok: false, reason: 'order status mismatch, ignoring stale/forged payload' })
      }

      await deleteVoiceChannel(existingChannelId)
      await saveChannelId(orderId, null)

      return jsonResponse(req, { ok: true, action: 'deleted' })
    }

    return jsonResponse(req, { ok: true, action: 'skipped' })
  } catch (err) {
    console.error('discord-order-channel error:', err)
    return jsonResponse(req, { error: 'discord_channel_error' }, 500)
  }
})

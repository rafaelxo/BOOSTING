import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { computeOrderPrice, type OrderPriceInput, type RankValue } from '../../../shared/pricing.ts'

const MP_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// Intenção do pedido enviada pelo cliente — nunca contém preço. O total é
// sempre recomputado aqui a partir de shared/pricing.ts (mesma lógica usada
// pelo order-builder só para exibir estimativa).
interface OrderIntent {
  service_type: OrderPriceInput['serviceType']
  service_id: string
  game_id: string
  queue_type: string
  boost_mode: 'solo' | 'duo'
  server: string
  current_rank: RankValue | null
  target_rank: RankValue | null
  current_lp: number
  avg_lp_gain: number
  avg_lp_loss: number
  target_lp: number | null
  wins_purchased: number | null
  sessions_purchased: number | null
  extra_ids: string[]
  win_package: 1 | 3 | 5 | null
  customer_notes: string | null
}

function isValidIntent(v: unknown): v is OrderIntent {
  if (!v || typeof v !== 'object') return false
  const i = v as Record<string, unknown>
  return (
    typeof i.service_type === 'string' &&
    typeof i.service_id === 'string' &&
    typeof i.game_id === 'string' &&
    typeof i.queue_type === 'string' &&
    (i.boost_mode === 'solo' || i.boost_mode === 'duo') &&
    typeof i.server === 'string' &&
    i.current_rank !== undefined &&
    Array.isArray(i.extra_ids)
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    // Authenticate caller
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json()
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    let orderId: string
    let order: { id: string; customer_id: string; total_price: number; mp_payment_id: string | null }

    if (body.order_id) {
      // ── Retry path: reuse an order already created by this function ──────────
      orderId = body.order_id

      const { data: existingOrder, error: orderErr } = await userClient
        .from('orders')
        .select('id, customer_id, total_price, status, mp_payment_id')
        .eq('id', orderId)
        .single()

      if (orderErr || !existingOrder) return json({ error: 'Order not found' }, 404)
      if (existingOrder.customer_id !== user.id) return json({ error: 'Forbidden' }, 403)
      if (existingOrder.status !== 'awaiting_payment') return json({ error: 'Order is not awaiting payment' }, 400)

      order = existingOrder
    } else if (isValidIntent(body.intent)) {
      // ── New order: server computes the authoritative price ──────────────────
      const intent = body.intent as OrderIntent
      const extraIds = [...new Set(intent.extra_ids)].filter((id) => typeof id === 'string')

      let extras: { id: string; name: string; price_modifier: number; price_modifier_pct: number }[] = []
      if (extraIds.length > 0) {
        const { data: extraRows, error: extraErr } = await serviceClient
          .from('service_extras')
          .select('id, name, price_modifier, price_modifier_pct')
          .in('id', extraIds)
          .eq('is_active', true)
        if (extraErr) return json({ error: 'Failed to load extras' }, 500)
        extras = extraRows ?? []
      }

      const priceInput: OrderPriceInput = {
        serviceType: intent.service_type,
        boostMode: intent.boost_mode,
        currentRank: intent.current_rank,
        targetRank: intent.target_rank,
        currentLp: intent.current_lp ?? 0,
        avgLpGain: intent.avg_lp_gain ?? 20,
        avgLpLoss: intent.avg_lp_loss ?? 15,
        targetLp: intent.target_lp ?? null,
        winsPurchased: intent.wins_purchased ?? null,
        sessionsPurchased: intent.sessions_purchased ?? null,
        extras: extras.map((e) => ({ id: e.id, priceModifier: Number(e.price_modifier), priceModifierPct: Number(e.price_modifier_pct) })),
        winPackage: intent.win_package ?? null,
      }

      const priced = computeOrderPrice(priceInput)
      if (priced.totalPrice <= 0) return json({ error: 'Invalid order amount' }, 400)

      const extrasJson = extras.map((e) => {
        const b = priced.extrasBreakdown.find((x) => x.id === e.id)
        return { extra_id: e.id, name: e.name, price: b?.price ?? 0 }
      })

      const { data: inserted, error: insertErr } = await serviceClient
        .from('orders')
        .insert({
          customer_id: user.id,
          service_id: intent.service_id,
          game_id: intent.game_id,
          status: 'awaiting_payment',
          queue_type: intent.queue_type,
          boost_mode: intent.boost_mode,
          server: intent.server,
          current_rank: intent.current_rank as never,
          target_rank: intent.target_rank as never,
          wins_purchased: intent.wins_purchased,
          sessions_purchased: intent.sessions_purchased,
          extras: extrasJson as never,
          win_package: intent.win_package,
          base_price: priced.basePrice,
          extras_price: priced.extrasPrice,
          total_price: priced.totalPrice,
          estimated_hours: priced.estimatedHours,
          customer_notes: intent.customer_notes || null,
        })
        .select('id, customer_id, total_price, mp_payment_id')
        .single()

      if (insertErr || !inserted) return json({ error: insertErr?.message ?? 'Erro ao criar pedido' }, 500)
      orderId = inserted.id
      order = inserted
    } else {
      return json({ error: 'Missing order_id or intent' }, 400)
    }

    // Amount is always derived from the DB row we just read/created — never
    // recomputed from anything the client sends at this point.
    if (!order.total_price || Number(order.total_price) <= 0) {
      return json({ error: 'Invalid order amount', order_id: orderId }, 400)
    }

    // If there is already a pending MP payment for this order, try to reuse it
    if (order.mp_payment_id) {
      const existing = await fetch(
        `https://api.mercadopago.com/v1/payments/${order.mp_payment_id}`,
        { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } },
      )
      if (existing.ok) {
        const mp = await existing.json()
        // pending or in_process: return the existing QR code
        if (mp.status === 'pending' || mp.status === 'in_process') {
          return json({
            order_id: orderId,
            total_price: order.total_price,
            payment_id: mp.id,
            qr_code: mp.point_of_interaction?.transaction_data?.qr_code,
            qr_code_base64: mp.point_of_interaction?.transaction_data?.qr_code_base64,
            expires_at: mp.date_of_expiration,
            reused: true,
          })
        }
      }
    }

    // Create new PIX payment via Mercado Pago API
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    // Amount sourced exclusively from the order row — client cannot influence this value
    const amountBrl = Number(order.total_price)

    const mpResp = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        // Idempotency key is scoped to the order itself — each order only
        // ever creates one MP payment through this path.
        'X-Idempotency-Key': orderId,
      },
      body: JSON.stringify({
        transaction_amount: amountBrl,
        description: `EloBoost — Pedido #${orderId.slice(0, 8).toUpperCase()}`,
        payment_method_id: 'pix',
        payer: { email: user.email },
        date_of_expiration: expiresAt,
        external_reference: orderId,
        notification_url: `${SUPABASE_URL}/functions/v1/mercadopago-webhook`,
      }),
    })

    if (!mpResp.ok) {
      const err = await mpResp.json()
      console.error('Mercado Pago error:', err)
      // Include order_id even on failure: the order row already exists at
      // this point, so a client retry must reuse it (order_id path) instead
      // of resending an intent and creating a second order.
      return json({ error: 'Falha ao criar pagamento PIX', details: err, order_id: orderId }, 502)
    }

    let mp = await mpResp.json()
    const mpPaymentId = String(mp.id)

    // MP occasionally returns the payment before the PIX QR image has
    // finished generating (point_of_interaction present but qr_code_base64
    // still null, or the whole block missing). Poll the payment a few times
    // server-side before responding, instead of pushing that wait onto the
    // client — this is the actual root cause of the "QR code sometimes
    // fails" symptom, not something a client-side retry alone can fix.
    for (let attempt = 0; attempt < 3 && !mp.point_of_interaction?.transaction_data?.qr_code_base64; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1200))
      const poll = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      })
      if (poll.ok) mp = await poll.json()
    }

    // Persist MP payment ID on the order and create the payment record
    await Promise.all([
      serviceClient
        .from('orders')
        .update({ mp_payment_id: mpPaymentId, updated_at: new Date().toISOString() })
        .eq('id', orderId),

      serviceClient.from('payments').upsert(
        {
          order_id: orderId,
          customer_id: user.id,
          mp_payment_id: mpPaymentId,
          amount: amountBrl,
          currency: 'brl',
          status: 'pending',
          metadata: { provider: 'mercadopago', mp_payment_id: mpPaymentId },
        },
        { onConflict: 'order_id' },
      ),
    ])

    return json({
      order_id: orderId,
      total_price: order.total_price,
      payment_id: mp.id,
      qr_code: mp.point_of_interaction?.transaction_data?.qr_code,
      qr_code_base64: mp.point_of_interaction?.transaction_data?.qr_code_base64,
      expires_at: mp.date_of_expiration,
      reused: false,
    })
  } catch (err) {
    console.error('create-pix-payment error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})

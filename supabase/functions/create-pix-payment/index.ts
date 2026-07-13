import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { z } from 'https://esm.sh/zod@3.23.8'
import { computeOrderPrice, rankStep, type OrderPriceInput, type RankValue, type ServiceType } from '../../../shared/pricing.ts'
import {
  type BoostFlow,
  isAddonCodeValidForFlow,
  isMasterPlusCurrentTier,
  isStandardTier,
  isValidMasterPlusProgression,
  hasDuplicateAddonCodes,
  getPdlBracket,
} from '../../../shared/boostDomain.ts'
import { handleCors } from '../_shared/cors.ts'
import { errorResponse, jsonResponse } from '../_shared/responses.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { getAuthUser } from '../_shared/authUser.ts'

const MP_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''

// ── Schemas ──────────────────────────────────────────────────────────────────
// O contrato é diferente por fluxo (padrão vs. Master+) — cada um usa
// `.strict()`, então um campo que não pertence ao fluxo (ex.: PDL alvo no
// Master+, ou Duo Boost no Master+) é rejeitado na validação, não apenas
// ignorado. A rota certa é decidida por um parse "leve" (routingSchema)
// antes de aplicar o schema estrito correspondente.

const STANDARD_TIERS = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond'] as const
const DIVISIONS = ['IV', 'III', 'II', 'I'] as const

const standardRankSchema = z.object({
  tier: z.enum(STANDARD_TIERS),
  division: z.enum(DIVISIONS).nullable().optional(),
}).strict()

const masterPlusCurrentRankSchema = z.object({
  tier: z.enum(['master', 'grandmaster']),
  division: z.null().optional(),
}).strict()

const masterPlusTargetRankSchema = z.object({
  tier: z.enum(['grandmaster', 'challenger']),
  division: z.null().optional(),
}).strict()

const genericRankSchema = z.object({
  tier: z.enum(['iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond', 'master', 'grandmaster', 'challenger']),
  division: z.enum(DIVISIONS).nullable().optional(),
})

// Parse leve, só para decidir qual schema estrito aplicar em seguida. Não é
// usado para nada além de roteamento.
const routingSchema = z.object({
  service_type: z.enum(['elo_boost', 'win_boost', 'placement_matches', 'coaching']),
  current_rank: genericRankSchema.nullable().optional(),
  boost_mode: z.enum(['solo', 'duo']).optional(),
}).passthrough()

// Solo Boost / Duo Boost padrão — Iron a Diamond.
const standardEloIntentSchema = z.object({
  service_type: z.literal('elo_boost'),
  service_id: z.string().min(1, 'service_id é obrigatório'),
  game_id: z.string().min(1, 'game_id é obrigatório'),
  queue_type: z.enum(['solo_duo', 'flex']),
  boost_mode: z.enum(['solo', 'duo']),
  server: z.string().min(1, 'server é obrigatório'),
  current_rank: standardRankSchema,
  target_rank: standardRankSchema,
  current_lp: z.number().int().min(0).max(100).default(0),
  avg_lp_gain: z.number().int().min(1).max(50).default(20),
  avg_lp_loss: z.number().int().min(1).max(50).default(15),
  addon_codes: z.array(z.string().min(1)).max(10).default([]),
  win_package: z.union([z.literal(1), z.literal(3), z.literal(5)]).nullable().default(null),
  customer_notes: z.string().max(500).nullable().default(null),
}).strict()

// Boost Master+ — rank atual Master ou Grão-Mestre. Sem PDL alvo: o preço
// vem da tabela comercial (origem × destino × faixa de PDL atual). Sem Duo
// (boost_mode nem existe neste schema). Sem pacote de vitórias (o modelo de
// preço por vitória não se aplica ao Master+).
const masterPlusIntentSchema = z.object({
  service_type: z.literal('elo_boost'),
  service_id: z.string().min(1, 'service_id é obrigatório'),
  game_id: z.string().min(1, 'game_id é obrigatório'),
  queue_type: z.enum(['solo_duo', 'flex']),
  boost_mode: z.literal('solo'),
  server: z.string().min(1, 'server é obrigatório'),
  current_rank: masterPlusCurrentRankSchema,
  target_rank: masterPlusTargetRankSchema,
  current_pdl: z.number().int().min(0),
  avg_pdl_gain: z.number().positive(),
  avg_pdl_loss: z.number().positive(),
  addon_codes: z.array(z.string().min(1)).max(10).default([]),
  customer_notes: z.string().max(500).nullable().default(null),
}).strict()

// Win Boost / Placement Matches / Coaching — fora do escopo desta reforma
// (Solo/Duo/Master+); mantido como antes, só sem o campo target_lp morto.
const otherServiceIntentSchema = z.object({
  service_type: z.enum(['win_boost', 'placement_matches', 'coaching']),
  service_id: z.string().min(1, 'service_id é obrigatório'),
  game_id: z.string().min(1, 'game_id é obrigatório'),
  queue_type: z.enum(['solo_duo', 'flex']),
  boost_mode: z.enum(['solo', 'duo']),
  server: z.string().min(1, 'server é obrigatório'),
  current_rank: genericRankSchema.nullable(),
  target_rank: genericRankSchema.nullable(),
  current_lp: z.number().int().min(0).max(9999).default(0),
  avg_lp_gain: z.number().int().min(1).max(50).default(20),
  avg_lp_loss: z.number().int().min(1).max(50).default(15),
  wins_purchased: z.number().int().min(1).max(50).nullable(),
  sessions_purchased: z.number().int().min(1).max(20).nullable(),
  addon_codes: z.array(z.string().min(1)).max(10).default([]),
  win_package: z.union([z.literal(1), z.literal(3), z.literal(5)]).nullable().default(null),
  customer_notes: z.string().max(500).nullable().default(null),
})

const bodySchema = z.object({
  order_id: z.string().uuid().optional(),
  intent: z.record(z.unknown()).optional(),
}).refine((body) => body.order_id || body.intent, {
  message: 'Informe order_id ou intent',
})

// Forma normalizada usada pelo resto do handler, independente de qual dos 3
// schemas estritos validou o intent — evita espalhar `'campo' in intent`
// pelo código abaixo.
interface NormalizedIntent {
  serviceType: ServiceType
  serviceId: string
  gameId: string
  queueType: 'solo_duo' | 'flex'
  boostMode: 'solo' | 'duo'
  server: string
  currentRank: RankValue
  targetRank: RankValue | null
  currentLp: number
  avgLpGain: number
  avgLpLoss: number
  winsPurchased: number | null
  sessionsPurchased: number | null
  addonCodes: string[]
  winPackage: 1 | 3 | 5 | null
  customerNotes: string | null
  currentPdl: number | null
  avgPdlGain: number | null
  avgPdlLoss: number | null
}

function badRequest(req: Request, message: string) {
  return errorResponse(req, message, 400)
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (!MP_ACCESS_TOKEN || !SUPABASE_URL) {
      return errorResponse(req, 'Server misconfigured', 500)
    }

    const auth = await getAuthUser(req.headers.get('Authorization'))
    if (!auth) return errorResponse(req, 'Unauthorized', 401)

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return badRequest(req, 'JSON inválido')
    }

    const parsedBody = bodySchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return jsonResponse(req, {
        error: 'Body inválido',
        issues: parsedBody.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      }, 400)
    }

    const body = parsedBody.data
    const userClient = auth.client
    const { user } = auth
    const serviceClient = supabaseAdmin()

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

      if (orderErr || !existingOrder) return errorResponse(req, 'Order not found', 404)
      if (existingOrder.customer_id !== user.id) return errorResponse(req, 'Forbidden', 403)
      if (existingOrder.status !== 'awaiting_payment') return badRequest(req, 'Order is not awaiting payment')

      order = existingOrder
    } else if (body.intent) {
      // ── New order: server decides the flow, validates it and computes the
      // authoritative price. Nothing about rank/mode/addon compatibility is
      // trusted from the client beyond "which combination are you asking for".

      const routed = routingSchema.safeParse(body.intent)
      if (!routed.success) {
        return jsonResponse(req, {
          error: 'Body inválido',
          issues: routed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        }, 400)
      }

      let flow: BoostFlow | null = null

      if (routed.data.service_type === 'elo_boost') {
        const tier = routed.data.current_rank?.tier
        if (!tier) return badRequest(req, 'current_rank é obrigatório para elo_boost')
        if (tier === 'challenger') return badRequest(req, 'Challenger não pode ser selecionado como rank atual')

        if (isMasterPlusCurrentTier(tier)) {
          if (routed.data.boost_mode === 'duo') return badRequest(req, 'Duo Boost não é aceito no fluxo Master+')
          flow = 'master_plus'
        } else if (isStandardTier(tier)) {
          flow = routed.data.boost_mode === 'duo' ? 'duo_standard' : 'solo_standard'
        } else {
          return badRequest(req, 'Rank atual inválido')
        }
      }

      const schema = flow === 'master_plus'
        ? masterPlusIntentSchema
        : flow
          ? standardEloIntentSchema
          : otherServiceIntentSchema

      const parsedIntent = schema.safeParse(body.intent)
      if (!parsedIntent.success) {
        return jsonResponse(req, {
          error: 'Body inválido',
          issues: parsedIntent.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        }, 400)
      }

      let normalized: NormalizedIntent
      let pdlBracket: string | null = null
      let masterPlusPrice: number | null = null

      if (flow === 'master_plus') {
        const mp = parsedIntent.data as z.infer<typeof masterPlusIntentSchema>
        if (!isValidMasterPlusProgression(mp.current_rank.tier, mp.target_rank.tier)) {
          return badRequest(req, 'Progressão de rank inválida para Master+')
        }
        pdlBracket = getPdlBracket(mp.current_pdl)

        const { data: priceRow, error: priceErr } = await serviceClient
          .from('master_plus_pricing')
          .select('price')
          .eq('current_tier', mp.current_rank.tier)
          .eq('target_tier', mp.target_rank.tier)
          .eq('pdl_bracket', pdlBracket)
          .maybeSingle()
        if (priceErr) return errorResponse(req, 'Falha ao carregar preço', 500)
        if (!priceRow || priceRow.price == null) {
          return badRequest(req, 'Faixa de preço ainda não configurada para esta combinação. Fale com o suporte.')
        }
        masterPlusPrice = Number(priceRow.price)

        normalized = {
          serviceType: 'elo_boost',
          serviceId: mp.service_id,
          gameId: mp.game_id,
          queueType: mp.queue_type,
          boostMode: 'solo',
          server: mp.server,
          currentRank: { tier: mp.current_rank.tier, division: null },
          targetRank: { tier: mp.target_rank.tier, division: null },
          currentLp: 0,
          avgLpGain: 20,
          avgLpLoss: 15,
          winsPurchased: null,
          sessionsPurchased: null,
          addonCodes: mp.addon_codes,
          winPackage: null,
          customerNotes: mp.customer_notes,
          currentPdl: mp.current_pdl,
          avgPdlGain: mp.avg_pdl_gain,
          avgPdlLoss: mp.avg_pdl_loss,
        }
      } else if (flow) {
        const std = parsedIntent.data as z.infer<typeof standardEloIntentSchema>
        if (rankStep(std.target_rank.tier, std.target_rank.division ?? null) <= rankStep(std.current_rank.tier, std.current_rank.division ?? null)) {
          return badRequest(req, 'Rank de destino precisa ser maior que o rank atual')
        }
        normalized = {
          serviceType: 'elo_boost',
          serviceId: std.service_id,
          gameId: std.game_id,
          queueType: std.queue_type,
          boostMode: std.boost_mode,
          server: std.server,
          currentRank: { tier: std.current_rank.tier, division: std.current_rank.division ?? null },
          targetRank: { tier: std.target_rank.tier, division: std.target_rank.division ?? null },
          currentLp: std.current_lp,
          avgLpGain: std.avg_lp_gain,
          avgLpLoss: std.avg_lp_loss,
          winsPurchased: null,
          sessionsPurchased: null,
          addonCodes: std.addon_codes,
          winPackage: std.win_package,
          customerNotes: std.customer_notes,
          currentPdl: null,
          avgPdlGain: null,
          avgPdlLoss: null,
        }
      } else {
        const other = parsedIntent.data as z.infer<typeof otherServiceIntentSchema>
        normalized = {
          serviceType: other.service_type,
          serviceId: other.service_id,
          gameId: other.game_id,
          queueType: other.queue_type,
          boostMode: other.boost_mode,
          server: other.server,
          currentRank: other.current_rank as RankValue,
          targetRank: other.target_rank as RankValue | null,
          currentLp: other.current_lp,
          avgLpGain: other.avg_lp_gain,
          avgLpLoss: other.avg_lp_loss,
          winsPurchased: other.wins_purchased,
          sessionsPurchased: other.sessions_purchased,
          addonCodes: other.addon_codes,
          winPackage: other.win_package,
          customerNotes: other.customer_notes,
          currentPdl: null,
          avgPdlGain: null,
          avgPdlLoss: null,
        }
      }

      // ── Addons: validados contra a whitelist do fluxo E contra o catálogo
      // vivo em service_extras (ativo, do fluxo certo). Nunca aceita
      // percentual/label vindo do cliente — só o código.
      const addonCodes = [...new Set(normalized.addonCodes)]
      let extras: { id: string; code: string | null; name: string; price_modifier: number; price_modifier_pct: number; sort_order: number }[] = []

      if (hasDuplicateAddonCodes(normalized.addonCodes)) return badRequest(req, 'Addon duplicado')

      if (flow) {
        for (const code of addonCodes) {
          if (!isAddonCodeValidForFlow(flow, code)) return badRequest(req, `Addon inválido para este fluxo: ${code}`)
        }
        if (addonCodes.length > 0) {
          const { data: rows, error: extraErr } = await serviceClient
            .from('service_extras')
            .select('id, code, name, price_modifier, price_modifier_pct, sort_order')
            .eq('flow', flow)
            .eq('is_active', true)
            .in('code', addonCodes)
          if (extraErr) return errorResponse(req, 'Failed to load extras', 500)
          if (!rows || rows.length !== addonCodes.length) return badRequest(req, 'Addon inexistente ou inativo')
          extras = rows
        }
      } else if (addonCodes.length > 0) {
        return badRequest(req, 'Addons não são aceitos para este tipo de serviço')
      }

      const priceInput: OrderPriceInput = {
        serviceType: normalized.serviceType,
        boostMode: normalized.boostMode,
        currentRank: normalized.currentRank,
        targetRank: normalized.targetRank,
        currentLp: normalized.currentLp,
        avgLpGain: normalized.avgLpGain,
        avgLpLoss: normalized.avgLpLoss,
        masterPlusPrice,
        winsPurchased: normalized.winsPurchased,
        sessionsPurchased: normalized.sessionsPurchased,
        extras: extras.map((e) => ({ id: e.id, priceModifier: Number(e.price_modifier), priceModifierPct: Number(e.price_modifier_pct) })),
        winPackage: normalized.winPackage,
      }

      const priced = computeOrderPrice(priceInput)
      if (priced.totalPrice <= 0) return badRequest(req, 'Invalid order amount')

      const extrasJson = extras.map((e) => {
        const b = priced.extrasBreakdown.find((x) => x.id === e.id)
        return {
          extra_id: e.id,
          code: e.code,
          name: e.name,
          percentage: Number(e.price_modifier_pct),
          price: b?.price ?? 0,
          sort_order: e.sort_order,
        }
      })

      const { data: inserted, error: insertErr } = await serviceClient
        .from('orders')
        .insert({
          customer_id: user.id,
          service_id: normalized.serviceId,
          game_id: normalized.gameId,
          status: 'awaiting_payment',
          queue_type: normalized.queueType,
          boost_mode: normalized.boostMode,
          server: normalized.server,
          current_rank: normalized.currentRank as never,
          target_rank: normalized.targetRank as never,
          wins_purchased: normalized.winsPurchased,
          sessions_purchased: normalized.sessionsPurchased,
          extras: extrasJson as never,
          win_package: normalized.winPackage,
          base_price: priced.basePrice,
          extras_price: priced.extrasPrice,
          total_price: priced.totalPrice,
          estimated_hours: priced.estimatedHours,
          customer_notes: normalized.customerNotes || null,
          current_pdl: normalized.currentPdl,
          pdl_bracket: pdlBracket,
          avg_pdl_gain: normalized.avgPdlGain,
          avg_pdl_loss: normalized.avgPdlLoss,
          pricing_version: 'v2',
        })
        .select('id, customer_id, total_price, mp_payment_id')
        .single()

      if (insertErr || !inserted) return errorResponse(req, insertErr?.message ?? 'Erro ao criar pedido', 500)
      orderId = inserted.id
      order = inserted
    } else {
      return badRequest(req, 'Missing order_id or intent')
    }

    // Amount is always derived from the DB row we just read/created — never
    // recomputed from anything the client sends at this point.
    if (!order.total_price || Number(order.total_price) <= 0) {
      return jsonResponse(req, { error: 'Invalid order amount', order_id: orderId }, 400)
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
          return jsonResponse(req, {
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
      return jsonResponse(req, { error: 'Falha ao criar pagamento PIX', order_id: orderId }, 502)
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

    return jsonResponse(req, {
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
    return errorResponse(req, (err as Error).message, 500)
  }
})

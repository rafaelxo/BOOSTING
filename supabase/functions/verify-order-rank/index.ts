import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { z } from 'https://esm.sh/zod@3.23.8'
import { rankStep, type RankTier, type Division } from '../../../shared/pricing.ts'
import { handleCors } from '../_shared/cors.ts'
import { errorResponse, jsonResponse, rateLimitResponse } from '../_shared/responses.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { getAuthUser } from '../_shared/authUser.ts'
import { fetchWithTimeout, HttpError, readJsonBody } from '../_shared/http.ts'
import { consumeUserRateLimit } from '../_shared/rateLimit.ts'

const RIOT_API_KEY = Deno.env.get('RIOT_API_KEY') ?? ''

// Brasil-only platform hoje (orders.server nunca é de fato trocado na UI) —
// roteamento fixo em vez de um mapa região→routing que nada usaria ainda.
const REGIONAL_ROUTE = 'americas'
const PLATFORM_ROUTE = 'br1'

const bodySchema = z.object({
  order_id: z.string().uuid(),
}).strict()

const RIOT_TIER_MAP: Record<string, RankTier> = {
  IRON: 'iron', BRONZE: 'bronze', SILVER: 'silver', GOLD: 'gold',
  PLATINUM: 'platinum', EMERALD: 'emerald', DIAMOND: 'diamond',
  MASTER: 'master', GRANDMASTER: 'grandmaster', CHALLENGER: 'challenger',
}
const RIOT_DIVISION_MAP: Record<string, Division> = { I: 'I', II: 'II', III: 'III', IV: 'IV' }
const NO_DIVISION_TIERS: RankTier[] = ['master', 'grandmaster', 'challenger']

function badRequest(req: Request, message: string) {
  return errorResponse(req, message, 400)
}

async function logAttempt(
  serviceClient: ReturnType<typeof supabaseAdmin>,
  params: {
    orderId: string
    requestedBy: string
    riotId: string
    fetchedTier: RankTier | null
    fetchedDivision: Division | null
    targetTier: RankTier
    targetDivision: Division | null
    passed: boolean
    errorReason?: string
  },
) {
  await serviceClient.from('order_rank_verifications').insert({
    order_id: params.orderId,
    requested_by: params.requestedBy,
    riot_id_checked: params.riotId,
    fetched_tier: params.fetchedTier,
    fetched_division: params.fetchedDivision,
    target_tier: params.targetTier,
    target_division: params.targetDivision,
    passed: params.passed,
    error_reason: params.errorReason ?? null,
  })
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (req.method !== 'POST') return errorResponse(req, 'Method not allowed', 405)
    if (!RIOT_API_KEY) return errorResponse(req, 'Server misconfigured', 500)

    const auth = await getAuthUser(req.headers.get('Authorization'))
    if (!auth) return errorResponse(req, 'Unauthorized', 401)
    const { user, client: userClient } = auth

    const rateLimit = await consumeUserRateLimit('verify-order-rank', user.id, 5, 300)
    if (!rateLimit.allowed) return rateLimitResponse(req, rateLimit.retryAfter)

    const rawBody = await readJsonBody(req)
    const parsedBody = bodySchema.safeParse(rawBody)
    if (!parsedBody.success) return badRequest(req, 'Body inválido')
    const { order_id: orderId } = parsedBody.data

    // RLS (orders_customer_read: assigned_booster_id = auth.uid()) already
    // scopes this to the caller's own assigned orders — no extra ownership
    // check needed beyond what the query itself can return.
    const { data: order, error: orderErr } = await userClient
      .from('orders')
      .select('id, status, target_rank, riot_id, assigned_booster_id')
      .eq('id', orderId)
      .maybeSingle()
    if (orderErr) return errorResponse(req, 'Failed to load order', 500)
    if (!order || order.assigned_booster_id !== user.id) return errorResponse(req, 'Order not found', 404)

    if (!['in_progress', 'paused', 'awaiting_customer'].includes(order.status as string)) {
      return badRequest(req, 'Pedido não está em um status verificável')
    }
    const targetRank = order.target_rank as { tier: RankTier; division: Division | null } | null
    if (!targetRank?.tier || !order.riot_id) {
      return badRequest(req, 'Este pedido não tem rank alvo ou Riot ID cadastrado')
    }

    const riotId = String(order.riot_id)
    const hashIdx = riotId.lastIndexOf('#')
    if (hashIdx < 1 || hashIdx === riotId.length - 1) {
      return badRequest(req, 'Riot ID inválido')
    }
    const gameName = riotId.slice(0, hashIdx)
    const tagLine = riotId.slice(hashIdx + 1)

    const serviceClient = supabaseAdmin()

    // ── Account-V1: Riot ID → puuid ──────────────────────────────────────────
    const accountResp = await fetchWithTimeout(
      `https://${REGIONAL_ROUTE}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY } },
    )

    if (accountResp.status === 404) {
      await logAttempt(serviceClient, {
        orderId, requestedBy: user.id, riotId, fetchedTier: null, fetchedDivision: null,
        targetTier: targetRank.tier, targetDivision: targetRank.division,
        passed: false, errorReason: 'account_not_found',
      })
      return jsonResponse(req, { passed: false, reason: 'account_not_found' })
    }
    if (accountResp.status === 429) return errorResponse(req, 'Verificação indisponível no momento, tente novamente em instantes', 503)
    if (!accountResp.ok) {
      console.error('Riot account-v1 error', accountResp.status)
      return errorResponse(req, 'Falha ao consultar conta Riot', 502)
    }
    const account = await accountResp.json() as { puuid?: string }
    if (!account.puuid) return errorResponse(req, 'Falha ao consultar conta Riot', 502)

    // ── League-V4 by puuid: puuid → ranked solo/duo entry ───────────────────
    const leagueResp = await fetchWithTimeout(
      `https://${PLATFORM_ROUTE}.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY } },
    )
    if (leagueResp.status === 429) return errorResponse(req, 'Verificação indisponível no momento, tente novamente em instantes', 503)
    if (!leagueResp.ok) {
      console.error('Riot league-v4 error', leagueResp.status)
      return errorResponse(req, 'Falha ao consultar rank na Riot', 502)
    }
    const entries = await leagueResp.json() as { queueType?: string; tier?: string; rank?: string }[]
    const soloEntry = Array.isArray(entries) ? entries.find((e) => e.queueType === 'RANKED_SOLO_5x5') : null

    const fetchedTier = soloEntry?.tier ? RIOT_TIER_MAP[soloEntry.tier] ?? null : null
    const fetchedDivision = fetchedTier && !NO_DIVISION_TIERS.includes(fetchedTier) && soloEntry?.rank
      ? RIOT_DIVISION_MAP[soloEntry.rank] ?? null
      : null

    if (!fetchedTier) {
      await logAttempt(serviceClient, {
        orderId, requestedBy: user.id, riotId, fetchedTier: null, fetchedDivision: null,
        targetTier: targetRank.tier, targetDivision: targetRank.division,
        passed: false, errorReason: 'unranked',
      })
      return jsonResponse(req, { passed: false, reason: 'unranked' })
    }

    const passed = rankStep(fetchedTier, fetchedDivision) >= rankStep(targetRank.tier, targetRank.division)

    await logAttempt(serviceClient, {
      orderId, requestedBy: user.id, riotId, fetchedTier, fetchedDivision,
      targetTier: targetRank.tier, targetDivision: targetRank.division,
      passed, errorReason: passed ? undefined : 'target_not_reached',
    })

    if (!passed) {
      return jsonResponse(req, {
        passed: false, reason: 'target_not_reached',
        fetched_tier: fetchedTier, fetched_division: fetchedDivision,
        target_tier: targetRank.tier, target_division: targetRank.division,
      })
    }

    const { data: completed, error: completeErr } = await serviceClient.rpc('complete_verified_order', {
      p_order_id: orderId,
      p_fetched_tier: fetchedTier,
      p_fetched_division: fetchedDivision,
      p_requested_by: user.id,
    })
    const result = completed as { success?: boolean; error?: string } | null
    if (completeErr || !result?.success) {
      console.error('complete_verified_order failed', result?.error ?? completeErr?.message)
      return errorResponse(req, result?.error ?? 'Falha ao concluir pedido', 500)
    }

    return jsonResponse(req, {
      passed: true,
      fetched_tier: fetchedTier, fetched_division: fetchedDivision,
      target_tier: targetRank.tier, target_division: targetRank.division,
    })
  } catch (err) {
    console.error('verify-order-rank error', err instanceof Error ? err.name : 'unknown')
    if (err instanceof HttpError) return errorResponse(req, err.message, err.status)
    return errorResponse(req, 'Internal server error', 500)
  }
})

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { z } from 'https://esm.sh/zod@3.23.8'
import { handleCors } from '../_shared/cors.ts'
import { errorResponse, jsonResponse, rateLimitResponse } from '../_shared/responses.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { getAuthUser } from '../_shared/authUser.ts'
import { HttpError, readJsonBody } from '../_shared/http.ts'
import { consumeUserRateLimit } from '../_shared/rateLimit.ts'
import {
  fetchRiotAccount,
  fetchMatchIdsSince,
  fetchMatchDetail,
  RIOT_QUEUE_TYPE,
} from '../_shared/riotLookup.ts'

const RIOT_API_KEY = Deno.env.get('RIOT_API_KEY') ?? ''
const REGIONAL_ROUTE = 'americas'

const bodySchema = z.object({
  order_id: z.string().uuid(),
}).strict()

function badRequest(req: Request, message: string) {
  return errorResponse(req, message, 400)
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

    const rateLimit = await consumeUserRateLimit('sync-order-matches', user.id, 20, 300)
    if (!rateLimit.allowed) return rateLimitResponse(req, rateLimit.retryAfter)

    const rawBody = await readJsonBody(req)
    const parsedBody = bodySchema.safeParse(rawBody)
    if (!parsedBody.success) return badRequest(req, 'Body inválido')
    const { order_id: orderId } = parsedBody.data

    // RLS (orders_customer_read/booster equivalent) já restringe a leitura ao
    // pedido do próprio booster — a checagem de assigned_booster_id abaixo é
    // defesa em profundidade, mesmo padrão da verify-order-rank.
    const { data: order, error: orderErr } = await userClient
      .from('orders')
      .select('id, status, assigned_booster_id, riot_id, queue_type, match_sync_started_at, wins_purchased')
      .eq('id', orderId)
      .maybeSingle()
    if (orderErr) return errorResponse(req, 'Failed to load order', 500)
    if (!order || order.assigned_booster_id !== user.id) return errorResponse(req, 'Order not found', 404)

    if (!['in_progress', 'paused'].includes(order.status as string)) {
      return badRequest(req, 'Pedido não está em um status sincronizável')
    }
    if (!order.riot_id) {
      return badRequest(req, 'Este pedido não tem conta Riot cadastrada para sincronizar')
    }

    const riotId = String(order.riot_id)
    const hashIdx = riotId.lastIndexOf('#')
    if (hashIdx < 1 || hashIdx === riotId.length - 1) {
      return badRequest(req, 'Riot ID inválido')
    }

    const serviceClient = supabaseAdmin()
    const startTimeEpochSeconds = order.match_sync_started_at
      ? Math.floor(new Date(order.match_sync_started_at as string).getTime() / 1000)
      : Math.floor(Date.now() / 1000) - 60 * 60 * 24

    // ── Account-V1: Riot ID → puuid ──────────────────────────────────────────
    const accountResult = await fetchRiotAccount(riotId, RIOT_API_KEY, REGIONAL_ROUTE)
    if (!accountResult.ok) {
      if (accountResult.reason === 'not_found') return jsonResponse(req, { synced: false, reason: 'account_not_found' })
      if (accountResult.reason === 'rate_limited') return errorResponse(req, 'Sincronização indisponível no momento, tente novamente em instantes', 503)
      console.error('Riot account-v1 error', accountResult.status)
      return errorResponse(req, 'Falha ao consultar conta Riot', 502)
    }
    const { puuid } = accountResult.account

    // Vitórias Avulsas/MD5 usam a fila do pedido; elo_boost também é sempre
    // solo_duo ou flex — mesmo mapeamento em todos os fluxos.
    const matchQueueId = RIOT_QUEUE_TYPE[order.queue_type as 'solo_duo' | 'flex'].matchQueueId

    const idsResult = await fetchMatchIdsSince(puuid, RIOT_API_KEY, REGIONAL_ROUTE, matchQueueId, startTimeEpochSeconds)
    if (!idsResult.ok) {
      if (idsResult.reason === 'rate_limited') return errorResponse(req, 'Sincronização indisponível no momento, tente novamente em instantes', 503)
      console.error('Riot match-v5 ids error', idsResult.status)
      return errorResponse(req, 'Falha ao consultar partidas na Riot', 502)
    }

    // Não reprocessa partidas já registradas — evita gastar chamadas da Riot
    // com detalhe de partidas que já sabemos ter contabilizado.
    const { data: existingMatches } = await serviceClient
      .from('order_matches')
      .select('external_match_id')
      .eq('order_id', orderId)
    const alreadyRecorded = new Set((existingMatches ?? []).map((m) => m.external_match_id as string))
    const newMatchIds = idsResult.matchIds.filter((id) => !alreadyRecorded.has(id))

    // Mais antiga primeiro, para o histórico e os contadores evoluírem em
    // ordem cronológica real.
    newMatchIds.reverse()

    const recorded: Array<{ external_match_id: string; result: 'win' | 'loss'; champion: string | null }> = []

    for (const matchId of newMatchIds) {
      const detail = await fetchMatchDetail(matchId, puuid, RIOT_API_KEY, REGIONAL_ROUTE)
      if (!detail.ok) {
        if (detail.reason === 'rate_limited') break
        console.error('Riot match-v5 detail error', matchId, detail.status)
        continue
      }

      const { data: recordResult, error: recordErr } = await serviceClient.rpc('record_order_match', {
        p_order_id: orderId,
        p_external_match_id: detail.detail.externalMatchId,
        p_result: detail.detail.result,
        p_champion: detail.detail.champion,
        p_kills: detail.detail.kills,
        p_deaths: detail.detail.deaths,
        p_assists: detail.detail.assists,
        p_queue_id: detail.detail.queueId,
        p_duration_seconds: detail.detail.durationSeconds,
        p_played_at: detail.detail.playedAt,
      })
      const result = recordResult as { success?: boolean; inserted?: boolean; error?: string } | null
      if (recordErr || !result?.success) {
        console.error('record_order_match failed', result?.error ?? recordErr?.message)
        // Pedido pode ter saído de in_progress/paused durante a sincronização
        // (ex: booster marcou concluído em outra aba) — para sem corromper o
        // que já foi contabilizado até aqui.
        if (result?.error === 'invalid_status') break
        continue
      }
      if (result.inserted) {
        recorded.push({
          external_match_id: detail.detail.externalMatchId,
          result: detail.detail.result,
          champion: detail.detail.champion,
        })
      }
    }

    await serviceClient.rpc('mark_order_match_sync', { p_order_id: orderId })

    // Um recálculo ao final do lote, não por partida — sync-order-matches
    // pode registrar várias partidas numa única chamada.
    if (recorded.length > 0) {
      await serviceClient.rpc('refresh_booster_performance_segments', { p_booster_id: user.id })
    }

    return jsonResponse(req, {
      synced: true,
      new_matches: recorded.length,
      matches: recorded,
    })
  } catch (err) {
    console.error('sync-order-matches error', err instanceof Error ? err.name : 'unknown')
    if (err instanceof HttpError) return errorResponse(req, err.message, err.status)
    return errorResponse(req, 'Internal server error', 500)
  }
})

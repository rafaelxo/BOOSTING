import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { z } from 'https://esm.sh/zod@3.23.8'
import { handleCors } from '../_shared/cors.ts'
import { errorResponse, jsonResponse, rateLimitResponse } from '../_shared/responses.ts'
import { getAuthUser } from '../_shared/authUser.ts'
import { fetchWithTimeout, HttpError, readJsonBody } from '../_shared/http.ts'
import { consumeUserRateLimit } from '../_shared/rateLimit.ts'
import type { RankTier, Division } from '../../../shared/pricing.ts'

const RIOT_API_KEY = Deno.env.get('RIOT_API_KEY') ?? ''
const SPLIT_START_TIMESTAMP = Number(Deno.env.get('LOL_SPLIT_START_TIMESTAMP') ?? '0')
const REGIONAL_ROUTE = 'americas'
const PLATFORM_ROUTE = 'br1'

const bodySchema = z.object({
  riot_id: z.string().trim().min(3).max(32).regex(/^[^#]{1,16}#[A-Za-z0-9]{2,5}$/),
  queue: z.enum(['solo_duo', 'flex']).default('solo_duo'),
}).strict()

const QUEUE_META = {
  solo_duo: { leagueQueue: 'RANKED_SOLO_5x5', matchQueueId: 420 },
  flex: { leagueQueue: 'RANKED_FLEX_SR', matchQueueId: 440 },
} as const

const RIOT_TIER_MAP: Record<string, RankTier> = {
  IRON: 'iron',
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD: 'gold',
  PLATINUM: 'platinum',
  EMERALD: 'emerald',
  DIAMOND: 'diamond',
  MASTER: 'master',
  GRANDMASTER: 'grandmaster',
  CHALLENGER: 'challenger',
}
const RIOT_DIVISION_MAP: Record<string, Division> = { I: 'I', II: 'II', III: 'III', IV: 'IV' }
const NO_DIVISION_TIERS: RankTier[] = ['master', 'grandmaster', 'challenger']

function badRequest(req: Request, message: string) {
  return errorResponse(req, message, 400)
}

function estimateAverageLpPerGame(tier: RankTier, wins: number, losses: number): number {
  if (NO_DIVISION_TIERS.includes(tier)) return 30
  const total = wins + losses
  if (total <= 0) return 22
  const winRate = wins / total
  if (winRate < 0.48) return 19
  if (winRate > 0.55) return 26
  return 22
}

async function fetchRankedMatchCountThisSplit(puuid: string, queueId: number): Promise<number | null> {
  if (!Number.isFinite(SPLIT_START_TIMESTAMP) || SPLIT_START_TIMESTAMP <= 0) return null
  const params = new URLSearchParams({
    queue: String(queueId),
    type: 'ranked',
    startTime: String(Math.floor(SPLIT_START_TIMESTAMP)),
    start: '0',
    count: '5',
  })
  const matchResp = await fetchWithTimeout(
    `https://${REGIONAL_ROUTE}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?${params.toString()}`,
    { headers: { 'X-Riot-Token': RIOT_API_KEY } },
  )
  if (matchResp.status === 429) throw new HttpError('Consulta temporariamente limitada pela Riot. Tente novamente em instantes.', 503)
  if (!matchResp.ok) {
    console.error('Riot match lookup failed', matchResp.status)
    return null
  }
  const ids = await matchResp.json() as string[]
  return Array.isArray(ids) ? ids.length : null
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (req.method !== 'POST') return errorResponse(req, 'Method not allowed', 405)
    if (!RIOT_API_KEY) return errorResponse(req, 'Server misconfigured', 500)

    const auth = await getAuthUser(req.headers.get('Authorization'))
    if (!auth) return errorResponse(req, 'Unauthorized', 401)

    const rateLimit = await consumeUserRateLimit('riot-account-rank', auth.user.id, 10, 60)
    if (!rateLimit.allowed) return rateLimitResponse(req, rateLimit.retryAfter)

    const rawBody = await readJsonBody(req, 8 * 1024)
    const parsedBody = bodySchema.safeParse(rawBody)
    if (!parsedBody.success) return badRequest(req, 'Riot ID inválido')

    const riotId = parsedBody.data.riot_id
    const queue = parsedBody.data.queue
    const queueMeta = QUEUE_META[queue]
    const hashIdx = riotId.lastIndexOf('#')
    const gameName = riotId.slice(0, hashIdx)
    const tagLine = riotId.slice(hashIdx + 1)

    const accountResp = await fetchWithTimeout(
      `https://${REGIONAL_ROUTE}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY } },
    )

    if (accountResp.status === 404) {
      return jsonResponse(req, { found: false, ranked: false })
    }
    if (accountResp.status === 429) {
      return errorResponse(req, 'Consulta temporariamente limitada pela Riot. Tente novamente em instantes.', 503)
    }
    if (!accountResp.ok) {
      console.error('Riot account lookup failed', accountResp.status)
      return errorResponse(req, 'Falha ao consultar conta Riot', 502)
    }

    const account = await accountResp.json() as { puuid?: string; gameName?: string; tagLine?: string }
    if (!account.puuid) return errorResponse(req, 'Falha ao consultar conta Riot', 502)

    const leagueResp = await fetchWithTimeout(
      `https://${PLATFORM_ROUTE}.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY } },
    )

    if (leagueResp.status === 429) {
      return errorResponse(req, 'Consulta temporariamente limitada pela Riot. Tente novamente em instantes.', 503)
    }
    if (!leagueResp.ok) {
      console.error('Riot league lookup failed', leagueResp.status)
      return errorResponse(req, 'Falha ao consultar elo na Riot', 502)
    }

    const entries = await leagueResp.json() as {
      queueType?: string
      tier?: string
      rank?: string
      leaguePoints?: number
      wins?: number
      losses?: number
    }[]
    const rankedEntry = Array.isArray(entries)
      ? entries.find((entry) => entry.queueType === queueMeta.leagueQueue)
      : null

    const tier = rankedEntry?.tier ? RIOT_TIER_MAP[rankedEntry.tier] ?? null : null
    if (!rankedEntry || !tier) {
      const playedCount = await fetchRankedMatchCountThisSplit(account.puuid, queueMeta.matchQueueId)
      const matchesRemaining = Math.max(0, 5 - (playedCount ?? 0))
      return jsonResponse(req, {
        found: true,
        ranked: false,
        queue,
        riot_id: `${account.gameName ?? gameName}#${account.tagLine ?? tagLine}`,
        md5_eligible: true,
        matches_remaining: matchesRemaining,
      })
    }

    const division = NO_DIVISION_TIERS.includes(tier)
      ? null
      : rankedEntry.rank ? RIOT_DIVISION_MAP[rankedEntry.rank] ?? null : null
    const wins = Number(rankedEntry.wins ?? 0)
    const losses = Number(rankedEntry.losses ?? 0)
    const averageLp = estimateAverageLpPerGame(tier, wins, losses)

    return jsonResponse(req, {
      found: true,
      ranked: true,
      queue,
      riot_id: `${account.gameName ?? gameName}#${account.tagLine ?? tagLine}`,
      tier,
      division,
      league_points: Math.max(0, Number(rankedEntry.leaguePoints ?? 0)),
      wins,
      losses,
      md5_eligible: false,
      avg_lp_gain: averageLp,
      avg_lp_loss: averageLp,
      message: 'Elo, LP atual e média por partida preenchidos pela Riot.',
    })
  } catch (err) {
    console.error('riot-account-rank error', err instanceof Error ? err.name : 'unknown')
    if (err instanceof HttpError) return errorResponse(req, err.message, err.status)
    return errorResponse(req, 'Internal server error', 500)
  }
})

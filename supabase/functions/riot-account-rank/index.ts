import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { z } from 'https://esm.sh/zod@3.23.8'
import { handleCors } from '../_shared/cors.ts'
import { errorResponse, jsonResponse, rateLimitResponse } from '../_shared/responses.ts'
import { getAuthUser } from '../_shared/authUser.ts'
import { fetchWithTimeout, HttpError, readJsonBody } from '../_shared/http.ts'
import { consumeUserRateLimit } from '../_shared/rateLimit.ts'
import type { RankTier, Division } from '../../../shared/pricing.ts'

const RIOT_API_KEY = Deno.env.get('RIOT_API_KEY') ?? ''
const REGIONAL_ROUTE = 'americas'
const PLATFORM_ROUTE = 'br1'

const bodySchema = z.object({
  riot_id: z.string().trim().min(3).max(32).regex(/^[^#]{1,16}#[A-Za-z0-9]{2,5}$/),
}).strict()

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
    const soloEntry = Array.isArray(entries)
      ? entries.find((entry) => entry.queueType === 'RANKED_SOLO_5x5')
      : null

    const tier = soloEntry?.tier ? RIOT_TIER_MAP[soloEntry.tier] ?? null : null
    if (!soloEntry || !tier) {
      return jsonResponse(req, {
        found: true,
        ranked: false,
        riot_id: `${account.gameName ?? gameName}#${account.tagLine ?? tagLine}`,
      })
    }

    const division = NO_DIVISION_TIERS.includes(tier)
      ? null
      : soloEntry.rank ? RIOT_DIVISION_MAP[soloEntry.rank] ?? null : null

    return jsonResponse(req, {
      found: true,
      ranked: true,
      riot_id: `${account.gameName ?? gameName}#${account.tagLine ?? tagLine}`,
      tier,
      division,
      league_points: Math.max(0, Number(soloEntry.leaguePoints ?? 0)),
      wins: Number(soloEntry.wins ?? 0),
      losses: Number(soloEntry.losses ?? 0),
      // Riot League-V4 exposes current LP, wins and losses, but not average LP
      // gain/loss. Keep these nullable so the UI only overwrites averages if a
      // future backend implementation can compute them safely.
      avg_lp_gain: null,
      avg_lp_loss: null,
      message: 'Elo e LP atual preenchidos pela Riot. Médias de ganho/perda continuam editáveis.',
    })
  } catch (err) {
    console.error('riot-account-rank error', err instanceof Error ? err.name : 'unknown')
    if (err instanceof HttpError) return errorResponse(req, err.message, err.status)
    return errorResponse(req, 'Internal server error', 500)
  }
})

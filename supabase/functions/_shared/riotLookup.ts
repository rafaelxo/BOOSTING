import { fetchWithTimeout } from './http.ts'
import type { RankTier, Division } from '../../../shared/pricing.ts'

export const RIOT_TIER_MAP: Record<string, RankTier> = {
  IRON: 'iron', BRONZE: 'bronze', SILVER: 'silver', GOLD: 'gold',
  PLATINUM: 'platinum', EMERALD: 'emerald', DIAMOND: 'diamond',
  MASTER: 'master', GRANDMASTER: 'grandmaster', CHALLENGER: 'challenger',
}
export const RIOT_DIVISION_MAP: Record<string, Division> = { I: 'I', II: 'II', III: 'III', IV: 'IV' }
export const NO_DIVISION_TIERS: RankTier[] = ['master', 'grandmaster', 'challenger']

// League-V4 informa LP atual e totais de vitórias/derrotas, mas não expõe o
// LP ganho/perdido por partida. Esta estimativa única é usada pela prévia e
// pela cobrança, sempre no servidor e sem confiar em médias do navegador.
export function estimateLpAverages(tier: RankTier, wins: number, losses: number): { gain: number; loss: number } {
  if (NO_DIVISION_TIERS.includes(tier)) return { gain: 30, loss: 30 }
  const total = wins + losses
  if (total <= 0) return { gain: 22, loss: 22 }
  const winRate = wins / total
  if (winRate < 0.48) return { gain: 19, loss: 25 }
  if (winRate > 0.55) return { gain: 26, loss: 18 }
  return { gain: 22, loss: 22 }
}

export interface RiotAccount {
  puuid: string
  gameName: string
  tagLine: string
}

export type RiotAccountResult =
  | { ok: true; account: RiotAccount }
  | { ok: false; reason: 'not_found' | 'rate_limited' | 'upstream_error'; status: number }

export async function fetchRiotAccount(
  riotId: string,
  apiKey: string,
  regionalRoute: string,
): Promise<RiotAccountResult> {
  const hashIdx = riotId.lastIndexOf('#')
  const gameName = riotId.slice(0, hashIdx)
  const tagLine = riotId.slice(hashIdx + 1)

  const resp = await fetchWithTimeout(
    `https://${regionalRoute}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    { headers: { 'X-Riot-Token': apiKey } },
  )

  if (resp.status === 404) return { ok: false, reason: 'not_found', status: 404 }
  if (resp.status === 429) return { ok: false, reason: 'rate_limited', status: 429 }
  if (!resp.ok) return { ok: false, reason: 'upstream_error', status: resp.status }

  const body = await resp.json() as { puuid?: string; gameName?: string; tagLine?: string }
  if (!body.puuid) return { ok: false, reason: 'upstream_error', status: 502 }

  return {
    ok: true,
    account: { puuid: body.puuid, gameName: body.gameName ?? gameName, tagLine: body.tagLine ?? tagLine },
  }
}

export interface LeagueEntry {
  queueType?: string
  tier?: string
  rank?: string
  leaguePoints?: number
  wins?: number
  losses?: number
}

export type LeagueEntriesResult =
  | { ok: true; entries: LeagueEntry[] }
  | { ok: false; reason: 'rate_limited' | 'upstream_error'; status: number }

export async function fetchLeagueEntries(
  puuid: string,
  apiKey: string,
  platformRoute: string,
): Promise<LeagueEntriesResult> {
  const resp = await fetchWithTimeout(
    `https://${platformRoute}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`,
    { headers: { 'X-Riot-Token': apiKey } },
  )
  if (resp.status === 429) return { ok: false, reason: 'rate_limited', status: 429 }
  if (!resp.ok) return { ok: false, reason: 'upstream_error', status: resp.status }
  const entries = await resp.json() as LeagueEntry[]
  return { ok: true, entries: Array.isArray(entries) ? entries : [] }
}

export const RIOT_QUEUE_TYPE: Record<'solo_duo' | 'flex', { leagueQueue: string; matchQueueId: number }> = {
  solo_duo: { leagueQueue: 'RANKED_SOLO_5x5', matchQueueId: 420 },
  flex: { leagueQueue: 'RANKED_FLEX_SR', matchQueueId: 440 },
}

export type MatchIdsResult =
  | { ok: true; matchIds: string[] }
  | { ok: false; reason: 'rate_limited' | 'upstream_error'; status: number }

export type RecentRankedRecordResult =
  | { ok: true; wins: number; losses: number; matches: number }
  | { ok: false; reason: 'rate_limited' | 'upstream_error'; status: number }

// Match-V5 não traz delta de LP, mas permite usar o desempenho real das dez
// partidas ranqueadas mais recentes como base da estimativa de ganho/perda.
export async function fetchRecentRankedRecord(
  puuid: string,
  apiKey: string,
  regionalRoute: string,
  queue: 'solo_duo' | 'flex',
): Promise<RecentRankedRecordResult> {
  const { matchQueueId } = RIOT_QUEUE_TYPE[queue]
  const idsResp = await fetchWithTimeout(
    `https://${regionalRoute}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids`
    + `?queue=${matchQueueId}&start=0&count=10`,
    { headers: { 'X-Riot-Token': apiKey } },
  )
  if (idsResp.status === 429) return { ok: false, reason: 'rate_limited', status: 429 }
  if (!idsResp.ok) return { ok: false, reason: 'upstream_error', status: idsResp.status }

  const matchIds = await idsResp.json() as string[]
  if (!Array.isArray(matchIds) || matchIds.length === 0) return { ok: true, wins: 0, losses: 0, matches: 0 }

  const details = await Promise.all(matchIds.map(async (matchId) => {
    const resp = await fetchWithTimeout(
      `https://${regionalRoute}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
      { headers: { 'X-Riot-Token': apiKey } },
    )
    if (resp.status === 429) return { ok: false as const, reason: 'rate_limited' as const, status: 429 }
    if (!resp.ok) return { ok: false as const, reason: 'upstream_error' as const, status: resp.status }
    const body = await resp.json() as { info?: { participants?: Array<{ puuid?: string; win?: boolean }> } }
    const participant = body.info?.participants?.find((candidate) => candidate.puuid === puuid)
    if (!participant || typeof participant.win !== 'boolean') {
      return { ok: false as const, reason: 'upstream_error' as const, status: 502 }
    }
    return { ok: true as const, win: participant.win }
  }))

  const failed = details.find((detail) => !detail.ok)
  if (failed && !failed.ok) return failed
  const wins = details.filter((detail) => detail.ok && detail.win).length
  return { ok: true, wins, losses: details.length - wins, matches: details.length }
}

// Placement-matches-remaining has no direct League-V4 field — Match-V5 is the
// only way to count ranked games played this split. `splitStartEpochSeconds`
// must be updated whenever Riot starts a new split (see LOL_SPLIT_START_TIMESTAMP
// in supabase/functions/README.md).
export async function fetchRankedMatchIdsThisSplit(
  puuid: string,
  apiKey: string,
  regionalRoute: string,
  queue: 'solo_duo' | 'flex',
  splitStartEpochSeconds: number,
): Promise<MatchIdsResult> {
  const { matchQueueId } = RIOT_QUEUE_TYPE[queue]
  const resp = await fetchWithTimeout(
    `https://${regionalRoute}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids`
    + `?queue=${matchQueueId}&startTime=${splitStartEpochSeconds}&count=10`,
    { headers: { 'X-Riot-Token': apiKey } },
  )
  if (resp.status === 429) return { ok: false, reason: 'rate_limited', status: 429 }
  if (!resp.ok) return { ok: false, reason: 'upstream_error', status: resp.status }
  const matchIds = await resp.json() as string[]
  return { ok: true, matchIds: Array.isArray(matchIds) ? matchIds : [] }
}

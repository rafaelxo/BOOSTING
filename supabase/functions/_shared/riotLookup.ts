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

export type LeagueCutoffResult =
  | { ok: true; cutoffLp: number }
  | { ok: false; reason: 'rate_limited' | 'upstream_error' | 'empty_league'; status: number }

// Challenger/Grandmaster league-v4 endpoints devolvem TODOS os jogadores da
// liga -- o "corte" (LP mínimo pra estar naquela liga agora) é o menor
// leaguePoints entre as entries. Usado só pra estimativa de prazo do Master+
// (nunca pro preço, que é fixo por tier -- migration 028); cacheado em
// riot_league_cutoffs (migration 074) porque essas ligas têm centenas/
// milhares de entries e não podem ser consultadas a cada visualização de
// pedido.
//
// Riot marca contas que não jogam há um tempo com `inactive: true` -- elas
// continuam listadas na liga (ainda não decaíram pra sair do tier) com o LP
// congelado no último valor, frequentemente bem abaixo do corte real. Filtra
// antes de calcular; se por acaso a liga inteira vier marcada inativa (nunca
// visto na prática), cai pro conjunto sem filtro em vez de reportar
// `empty_league` à toa.
//
// Mesmo assim sobra outro caso: um jogador PODE ficar abaixo do LP mínimo de
// entrada depois de promovido (perde partidas e só é rebaixado ao chegar em
// 0 LP, não ao cruzar o piso de entrada de novo) -- ele continua contando
// como challenger/grão-mestre, mas não representa o corte real pra quem tá
// subindo. Pelas regras oficiais da Riot (Apex Tiers), ninguém entra em
// grão-mestre com menos de 400 LP nem em challenger com menos de 800 -- um
// corte abaixo disso é sempre um desses jogadores "sobrando", nunca o corte
// de fato. Usa isso como piso.
const TIER_ENTRY_FLOOR_LP: Record<'grandmaster' | 'challenger', number> = {
  grandmaster: 400,
  challenger: 800,
}

export async function fetchLeagueCutoff(
  tier: 'grandmaster' | 'challenger',
  queue: 'solo_duo' | 'flex',
  apiKey: string,
  platformRoute: string,
): Promise<LeagueCutoffResult> {
  const { leagueQueue } = RIOT_QUEUE_TYPE[queue]
  const path = tier === 'challenger' ? 'challengerleagues' : 'grandmasterleagues'
  const resp = await fetchWithTimeout(
    `https://${platformRoute}.api.riotgames.com/lol/league/v4/${path}/by-queue/${leagueQueue}`,
    { headers: { 'X-Riot-Token': apiKey } },
    15_000,
  )
  if (resp.status === 429) return { ok: false, reason: 'rate_limited', status: 429 }
  if (!resp.ok) return { ok: false, reason: 'upstream_error', status: resp.status }

  const body = await resp.json() as { entries?: { leaguePoints?: number; inactive?: boolean }[] }
  const entries = body.entries ?? []
  const active = entries.filter((e) => e.inactive !== true)
  const points = (active.length > 0 ? active : entries)
    .map((e) => e.leaguePoints)
    .filter((lp): lp is number => typeof lp === 'number')
  if (points.length === 0) return { ok: false, reason: 'empty_league', status: 502 }

  return { ok: true, cutoffLp: Math.max(TIER_ENTRY_FLOOR_LP[tier], Math.min(...points)) }
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

// ── Sincronização automática de partidas de um pedido (sync-order-matches) ──

// Mais recentes primeiro (ordem nativa da Match-V5) — startTime em epoch
// segundos, sempre orders.match_sync_started_at, nunca partidas anteriores
// ao início do boost.
export async function fetchMatchIdsSince(
  puuid: string,
  apiKey: string,
  regionalRoute: string,
  matchQueueId: number,
  startTimeEpochSeconds: number,
  count = 20,
): Promise<MatchIdsResult> {
  const resp = await fetchWithTimeout(
    `https://${regionalRoute}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids`
    + `?queue=${matchQueueId}&startTime=${startTimeEpochSeconds}&count=${count}`,
    { headers: { 'X-Riot-Token': apiKey } },
  )
  if (resp.status === 429) return { ok: false, reason: 'rate_limited', status: 429 }
  if (!resp.ok) return { ok: false, reason: 'upstream_error', status: resp.status }
  const matchIds = await resp.json() as string[]
  return { ok: true, matchIds: Array.isArray(matchIds) ? matchIds : [] }
}

export interface MatchDetail {
  externalMatchId: string
  result: 'win' | 'loss'
  champion: string | null
  kills: number
  deaths: number
  assists: number
  queueId: number | null
  durationSeconds: number | null
  playedAt: string
}

export type MatchDetailResult =
  | { ok: true; detail: MatchDetail }
  | { ok: false; reason: 'rate_limited' | 'upstream_error' | 'participant_not_found'; status: number }

// Uma partida por vez (Match-V5 não expõe um endpoint em lote) — o
// participante é localizado pelo puuid, nunca por posição/index.
export async function fetchMatchDetail(
  matchId: string,
  puuid: string,
  apiKey: string,
  regionalRoute: string,
): Promise<MatchDetailResult> {
  const resp = await fetchWithTimeout(
    `https://${regionalRoute}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
    { headers: { 'X-Riot-Token': apiKey } },
  )
  if (resp.status === 429) return { ok: false, reason: 'rate_limited', status: 429 }
  if (!resp.ok) return { ok: false, reason: 'upstream_error', status: resp.status }

  const body = await resp.json() as {
    info?: {
      queueId?: number
      gameDuration?: number
      gameEndTimestamp?: number
      participants?: Array<{
        puuid?: string
        win?: boolean
        championName?: string
        kills?: number
        deaths?: number
        assists?: number
      }>
    }
  }
  const participant = body.info?.participants?.find((candidate) => candidate.puuid === puuid)
  if (!participant || typeof participant.win !== 'boolean') {
    return { ok: false, reason: 'participant_not_found', status: 502 }
  }

  return {
    ok: true,
    detail: {
      externalMatchId: matchId,
      result: participant.win ? 'win' : 'loss',
      champion: participant.championName ?? null,
      kills: participant.kills ?? 0,
      deaths: participant.deaths ?? 0,
      assists: participant.assists ?? 0,
      queueId: body.info?.queueId ?? null,
      durationSeconds: body.info?.gameDuration ?? null,
      playedAt: new Date((body.info?.gameEndTimestamp ?? Date.now())).toISOString(),
    },
  }
}

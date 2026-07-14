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
  NO_DIVISION_TIERS,
} from '../../../shared/boostDomain.ts'
import { errorResponse, jsonResponse } from './responses.ts'
import type { supabaseAdmin } from './supabaseAdmin.ts'
import {
  fetchLeagueEntries,
  fetchRankedMatchIdsThisSplit,
  fetchRiotAccount,
  RIOT_QUEUE_TYPE,
  RIOT_TIER_MAP,
} from './riotLookup.ts'

// ── Schemas ──────────────────────────────────────────────────────────────────
// O contrato é diferente por fluxo (padrão vs. Master+) — cada um usa
// `.strict()`, então um campo que não pertence ao fluxo (ex.: PDL alvo no
// Master+, ou Duo Boost no Master+) é rejeitado na validação, não apenas
// ignorado. A rota certa é decidida por um parse "leve" (routingSchema)
// antes de aplicar o schema estrito correspondente.
//
// Este módulo é compartilhado por create-pix-payment (cria o pedido e cobra
// via Mercado Pago) e order-quote (só cotação, read-only) — por isso ele não
// sabe nada sobre inserção em `orders` nem sobre Mercado Pago.

const STANDARD_TIERS = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond'] as const
const DIVISIONS = ['IV', 'III', 'II', 'I'] as const

const standardRankSchema = z.object({
  tier: z.enum(STANDARD_TIERS),
  division: z.enum(DIVISIONS),
}).strict()

// Rank alvo do fluxo padrão pode ir além de Diamond — até Master, Grão-Mestre
// ou Challenger — usando a mesma progressão por degrau (mesma fórmula de
// preço, sem tabela de PDL: isso é diferente do fluxo Master+, que só existe
// quando o rank ATUAL já é Master/Grão-Mestre). Tiers sem divisão devem vir
// com division nula.
const ALL_TIERS = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond', 'master', 'grandmaster', 'challenger'] as const
const standardTargetRankSchema = z.object({
  tier: z.enum(ALL_TIERS),
  division: z.enum(DIVISIONS).nullable().optional(),
}).strict().superRefine((val, ctx) => {
  if (NO_DIVISION_TIERS.includes(val.tier) && val.division) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Master, Grão-Mestre e Challenger não têm divisão', path: ['division'] })
  } else if (!NO_DIVISION_TIERS.includes(val.tier) && !val.division) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Divisão é obrigatória para este rank', path: ['division'] })
  }
})

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
}).strict().superRefine((val, ctx) => {
  if (NO_DIVISION_TIERS.includes(val.tier) && val.division) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Master, Grão-Mestre e Challenger não têm divisão', path: ['division'] })
  } else if (!NO_DIVISION_TIERS.includes(val.tier) && !val.division) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Divisão é obrigatória para este rank', path: ['division'] })
  }
})

// Parse leve, só para decidir qual schema estrito aplicar em seguida. Não é
// usado para nada além de roteamento.
const routingSchema = z.object({
  service_type: z.enum(['elo_boost', 'win_boost', 'placement_matches', 'coaching', 'md5']),
  current_rank: genericRankSchema.nullable().optional(),
  boost_mode: z.enum(['solo', 'duo']).optional(),
}).passthrough()

// Riot ID: gameName#tagLine. gameName é 3-16 chars (regras da Riot),
// tagLine é 2-5 alfanuméricos.
const riotIdSchema = z.string().regex(/^.{3,16}#[A-Za-z0-9]{2,5}$/, 'Riot ID inválido (formato: nome#tag)')

// Solo Boost / Duo Boost padrão — Iron a Diamond.
const standardEloIntentSchema = z.object({
  service_type: z.literal('elo_boost'),
  service_id: z.string().uuid(),
  game_id: z.string().uuid(),
  queue_type: z.enum(['solo_duo', 'flex']),
  boost_mode: z.enum(['solo', 'duo']),
  server: z.string().trim().min(2).max(16),
  current_rank: standardRankSchema,
  target_rank: standardTargetRankSchema,
  current_lp: z.number().int().min(0).max(100).default(0),
  avg_lp_gain: z.number().int().min(1).max(50).default(20),
  avg_lp_loss: z.number().int().min(1).max(50).default(15),
  addon_codes: z.array(z.string().min(1)).max(10).default([]),
  win_package: z.union([z.literal(1), z.literal(3), z.literal(5)]).nullable().default(null),
  customer_notes: z.string().max(500).nullable().default(null),
  riot_id: riotIdSchema,
}).strict()

// Boost Master+ — rank atual Master ou Grão-Mestre. Sem PDL alvo: o preço
// vem da tabela comercial (origem × destino × faixa de PDL atual). Sem Duo
// (boost_mode nem existe neste schema). Sem pacote de vitórias (o modelo de
// preço por vitória não se aplica ao Master+).
const masterPlusIntentSchema = z.object({
  service_type: z.literal('elo_boost'),
  service_id: z.string().uuid(),
  game_id: z.string().uuid(),
  queue_type: z.enum(['solo_duo', 'flex']),
  boost_mode: z.literal('solo'),
  server: z.string().trim().min(2).max(16),
  current_rank: masterPlusCurrentRankSchema,
  target_rank: masterPlusTargetRankSchema,
  current_pdl: z.number().int().min(0),
  avg_pdl_gain: z.number().positive(),
  avg_pdl_loss: z.number().positive(),
  addon_codes: z.array(z.string().min(1)).max(10).default([]),
  customer_notes: z.string().max(500).nullable().default(null),
  riot_id: riotIdSchema,
}).strict()

// Win Boost / Placement Matches / Coaching — fora do escopo desta reforma
// (Solo/Duo/Master+); mantido como antes, só sem o campo target_lp morto.
const otherServiceIntentSchema = z.object({
  service_type: z.enum(['win_boost', 'placement_matches', 'coaching']),
  service_id: z.string().uuid(),
  game_id: z.string().uuid(),
  queue_type: z.enum(['solo_duo', 'flex']),
  boost_mode: z.enum(['solo', 'duo']),
  server: z.string().trim().min(2).max(16),
  current_rank: genericRankSchema.nullable(),
  target_rank: genericRankSchema.nullable(),
  current_lp: z.number().int().min(0).max(9999).default(0),
  avg_lp_gain: z.number().int().min(1).max(50).default(20),
  avg_lp_loss: z.number().int().min(1).max(50).default(15),
  // Vitórias — só win_boost usa este campo (1-5, mesmo cap do MD5, ver seção
  // 14-bis); placement_matches/coaching sempre mandam null aqui (reforçado
  // pelas checagens de negócio abaixo), então apertar o max não os afeta.
  wins_purchased: z.number().int().min(1).max(5).nullable(),
  sessions_purchased: z.number().int().min(1).max(20).nullable(),
  addon_codes: z.array(z.string().min(1)).max(10).default([]),
  win_package: z.union([z.literal(1), z.literal(3), z.literal(5)]).nullable().default(null),
  customer_notes: z.string().max(500).nullable().default(null),
  // Obrigatório quando service_type === 'coaching' (validado abaixo, não no
  // schema — o mesmo schema também cobre win_boost/placement_matches, que
  // não usam pacote de coach nenhum).
  booster_service_id: z.string().uuid().nullable().default(null),
}).strict()

// MD5 — "Rank da última temporada": Iron–Challenger valid, no LP/PDL/target
// concept (win-rate-guarantee is priced per net win, not per rank progression).
const md5IntentSchema = z.object({
  service_type: z.literal('md5'),
  service_id: z.string().uuid(),
  game_id: z.string().uuid(),
  queue_type: z.enum(['solo_duo', 'flex']),
  server: z.string().trim().min(2).max(16),
  // "Rank da última temporada" — no LP/PDL, no target. Iron–Challenger valid;
  // division required except Master+.
  current_rank: genericRankSchema.strict().superRefine((val, ctx) => {
    if (NO_DIVISION_TIERS.includes(val.tier) && val.division) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Master, Grão-Mestre e Challenger não têm divisão', path: ['division'] })
    } else if (!NO_DIVISION_TIERS.includes(val.tier) && !val.division) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Divisão é obrigatória para este rank', path: ['division'] })
    }
  }),
  wins_purchased: z.number().int().min(1).max(5),
  customer_notes: z.string().max(500).nullable().default(null),
  riot_id: riotIdSchema,
}).strict()

// Forma normalizada usada pelo resto do handler, independente de qual dos 3
// schemas estritos validou o intent — evita espalhar `'campo' in intent`
// pelo código abaixo.
export interface NormalizedIntent {
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
  riotId: string | null
  boosterServiceId: string | null
}

export interface QuoteResult {
  ok: true
  normalized: NormalizedIntent
  priced: ReturnType<typeof computeOrderPrice>
  md5MatchesRemaining: number | null
  pdlBracket: string | null
  coachPackagePrice: number | null
  preferredBoosterId: string | null
  extras: { id: string; code: string | null; name: string; price_modifier: number; price_modifier_pct: number; sort_order: number }[]
}

export type QuoteOutcome = QuoteResult | { ok: false; response: Response }

function badRequest(req: Request, message: string): Response {
  return errorResponse(req, message, 400)
}

// Valida (schema por fluxo + regras de negócio), reconfere elegibilidade MD5
// direto na Riot, valida pacote de coach/addons e calcula o preço
// autoritativo — tudo que create-pix-payment e order-quote têm em comum.
// Nunca cria pedido, nunca chama Mercado Pago, nunca confia em preço vindo
// do cliente.
export async function validateAndPriceIntent(
  req: Request,
  intent: unknown,
  userId: string,
  serviceClient: ReturnType<typeof supabaseAdmin>,
  riotApiKey: string,
  preferredBoosterIdInput: string | null,
): Promise<QuoteOutcome> {
  // Booster diretamente vinculado (veio do perfil público) — nunca confia
  // no client além do id; precisa ser um booster aprovado e não pode ser
  // o próprio cliente.
  let preferredBoosterId: string | null = null
  if (preferredBoosterIdInput) {
    if (preferredBoosterIdInput === userId) {
      return { ok: false, response: badRequest(req, 'Você não pode vincular um pedido a si mesmo') }
    }
    const { data: boosterRow, error: boosterErr } = await serviceClient
      .from('booster_profiles')
      .select('user_id')
      .eq('user_id', preferredBoosterIdInput)
      .eq('status', 'approved')
      .maybeSingle()
    if (boosterErr) return { ok: false, response: errorResponse(req, 'Failed to validate booster', 500) }
    if (!boosterRow) return { ok: false, response: badRequest(req, 'Booster inválido ou não aprovado') }
    preferredBoosterId = boosterRow.user_id
  }

  const routed = routingSchema.safeParse(intent)
  if (!routed.success) {
    return {
      ok: false,
      response: jsonResponse(req, {
        error: 'Body inválido',
        issues: routed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      }, 400),
    }
  }

  let flow: BoostFlow | null = null

  if (routed.data.service_type === 'elo_boost') {
    const tier = routed.data.current_rank?.tier
    if (!tier) return { ok: false, response: badRequest(req, 'current_rank é obrigatório para elo_boost') }
    if (tier === 'challenger') return { ok: false, response: badRequest(req, 'Challenger não pode ser selecionado como rank atual') }

    if (isMasterPlusCurrentTier(tier)) {
      if (routed.data.boost_mode === 'duo') return { ok: false, response: badRequest(req, 'Duo Boost não é aceito no fluxo Master+') }
      flow = 'master_plus'
    } else if (isStandardTier(tier)) {
      flow = routed.data.boost_mode === 'duo' ? 'duo_standard' : 'solo_standard'
    } else {
      return { ok: false, response: badRequest(req, 'Rank atual inválido') }
    }
  }

  const schema = flow === 'master_plus'
    ? masterPlusIntentSchema
    : flow
      ? standardEloIntentSchema
      : routed.data.service_type === 'md5'
        ? md5IntentSchema
        : otherServiceIntentSchema

  const parsedIntent = schema.safeParse(intent)
  if (!parsedIntent.success) {
    return {
      ok: false,
      response: jsonResponse(req, {
        error: 'Body inválido',
        issues: parsedIntent.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      }, 400),
    }
  }

  let normalized: NormalizedIntent
  let pdlBracket: string | null = null
  let masterPlusPrice: number | null = null

  if (flow === 'master_plus') {
    const mp = parsedIntent.data as z.infer<typeof masterPlusIntentSchema>
    if (!isValidMasterPlusProgression(mp.current_rank.tier, mp.target_rank.tier)) {
      return { ok: false, response: badRequest(req, 'Progressão de rank inválida para Master+') }
    }
    pdlBracket = getPdlBracket(mp.current_pdl)

    const { data: priceRow, error: priceErr } = await serviceClient
      .from('master_plus_pricing')
      .select('price')
      .eq('current_tier', mp.current_rank.tier)
      .eq('target_tier', mp.target_rank.tier)
      .eq('pdl_bracket', pdlBracket)
      .maybeSingle()
    if (priceErr) return { ok: false, response: errorResponse(req, 'Falha ao carregar preço', 500) }
    if (!priceRow || priceRow.price == null) {
      return { ok: false, response: badRequest(req, 'Faixa de preço ainda não configurada para esta combinação. Fale com o suporte.') }
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
      riotId: mp.riot_id,
      boosterServiceId: null,
    }
  } else if (flow) {
    const std = parsedIntent.data as z.infer<typeof standardEloIntentSchema>
    if (rankStep(std.target_rank.tier, std.target_rank.division ?? null) <= rankStep(std.current_rank.tier, std.current_rank.division ?? null)) {
      return { ok: false, response: badRequest(req, 'Rank de destino precisa ser maior que o rank atual') }
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
      riotId: std.riot_id,
      boosterServiceId: null,
    }
  } else if (routed.data.service_type === 'md5') {
    const md5 = parsedIntent.data as z.infer<typeof md5IntentSchema>
    normalized = {
      serviceType: 'md5',
      serviceId: md5.service_id,
      gameId: md5.game_id,
      queueType: md5.queue_type,
      boostMode: 'solo',
      server: md5.server,
      currentRank: { tier: md5.current_rank.tier, division: md5.current_rank.division ?? null },
      targetRank: null,
      currentLp: 0,
      avgLpGain: 20,
      avgLpLoss: 15,
      winsPurchased: md5.wins_purchased,
      sessionsPurchased: null,
      addonCodes: [],
      winPackage: null,
      customerNotes: md5.customer_notes,
      currentPdl: null,
      avgPdlGain: null,
      avgPdlLoss: null,
      riotId: md5.riot_id,
      boosterServiceId: null,
    }
  } else {
    const other = parsedIntent.data as z.infer<typeof otherServiceIntentSchema>
    if (other.service_type === 'win_boost') {
      if (!other.current_rank) return { ok: false, response: badRequest(req, 'Rank atual é obrigatório para Vitórias') }
      if (!other.wins_purchased) return { ok: false, response: badRequest(req, 'Quantidade de vitórias é obrigatória') }
      if (other.win_package) return { ok: false, response: badRequest(req, 'Pacote de vitórias extras não é aceito em Vitórias') }
      if (other.booster_service_id) return { ok: false, response: badRequest(req, 'Pacote de coach não é aceito em Vitórias') }
    }
    if (other.service_type === 'placement_matches') {
      if (!other.current_rank) return { ok: false, response: badRequest(req, 'Rank final da última temporada é obrigatório para MD5 Completo') }
      if (other.wins_purchased || other.win_package) return { ok: false, response: badRequest(req, 'Vitórias não são aceitas em MD5 Completo') }
      if (other.booster_service_id) return { ok: false, response: badRequest(req, 'Pacote de coach não é aceito em MD5 Completo') }
    }
    if (other.service_type === 'coaching') {
      if (!other.booster_service_id) return { ok: false, response: badRequest(req, 'Selecione um pacote de coach') }
      if (other.current_rank || other.target_rank || other.wins_purchased || other.win_package) {
        return { ok: false, response: badRequest(req, 'Ranks e vitórias não são aceitos em Coaching') }
      }
    }
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
      riotId: null,
      boosterServiceId: other.booster_service_id,
    }
  }

  const [{ data: service, error: serviceError }, { data: game, error: gameError }] = await Promise.all([
    serviceClient.from('services').select('id, game_id, type, is_active').eq('id', normalized.serviceId).maybeSingle(),
    serviceClient.from('games').select('id, is_active').eq('id', normalized.gameId).maybeSingle(),
  ])
  if (serviceError || gameError) return { ok: false, response: errorResponse(req, 'Failed to validate catalog', 500) }
  if (!service || !game || !service.is_active || !game.is_active
      || service.game_id !== game.id || service.type !== normalized.serviceType) {
    return { ok: false, response: badRequest(req, 'Serviço ou jogo inválido/inativo') }
  }

  // ── MD5: a pré-visualização do cliente (riot-account-rank) é só um
  // preview — nunca confiável para decidir elegibilidade. Aqui a Riot é
  // consultada de novo, server-side, e o pedido é bloqueado se a conta já
  // tiver rank na fila selecionada nesta temporada.
  let md5MatchesRemaining: number | null = null
  if (normalized.serviceType === 'md5') {
    if (!riotApiKey) return { ok: false, response: errorResponse(req, 'Server misconfigured', 500) }
    if (!normalized.winsPurchased || normalized.winsPurchased < 1 || normalized.winsPurchased > 5) {
      return { ok: false, response: badRequest(req, 'MD5 aceita apenas 1 a 5 vitórias') }
    }
    const accountResult = await fetchRiotAccount(normalized.riotId!, riotApiKey, 'americas')
    if (!accountResult.ok) {
      if (accountResult.reason === 'not_found') {
        return { ok: false, response: badRequest(req, 'Conta Riot não encontrada') }
      }
      if (accountResult.reason === 'rate_limited') {
        return { ok: false, response: errorResponse(req, 'Consulta temporariamente limitada pela Riot. Tente novamente em instantes.', 503) }
      }
      console.error('Riot account lookup failed', accountResult.status)
      return { ok: false, response: errorResponse(req, 'Falha ao consultar conta Riot', 502) }
    }
    const leagueResult = await fetchLeagueEntries(accountResult.account.puuid, riotApiKey, 'br1')
    if (!leagueResult.ok) {
      if (leagueResult.reason === 'rate_limited') {
        return { ok: false, response: errorResponse(req, 'Consulta temporariamente limitada pela Riot. Tente novamente em instantes.', 503) }
      }
      console.error('Riot league lookup failed', leagueResult.status)
      return { ok: false, response: errorResponse(req, 'Falha ao verificar elegibilidade MD5', 502) }
    }

    const { leagueQueue } = RIOT_QUEUE_TYPE[normalized.queueType]
    const alreadyRanked = leagueResult.entries.some((e) => e.queueType === leagueQueue && RIOT_TIER_MAP[e.tier ?? ''])
    if (alreadyRanked) {
      return { ok: false, response: badRequest(req, 'Esta conta já possui rank na fila selecionada nesta temporada — MD5 não está disponível.') }
    }

    md5MatchesRemaining = 5
    const splitStart = Number(Deno.env.get('LOL_SPLIT_START_TIMESTAMP') ?? '0')
    if (splitStart > 0) {
      const matchResult = await fetchRankedMatchIdsThisSplit(
        accountResult.account.puuid, riotApiKey, 'americas', normalized.queueType, splitStart,
      )
      if (matchResult.ok) md5MatchesRemaining = Math.max(0, 5 - matchResult.matchIds.length)
    }
    if (md5MatchesRemaining < 1) return { ok: false, response: badRequest(req, 'MD5 já foi concluída nesta fila') }
    if (normalized.winsPurchased > md5MatchesRemaining) {
      return { ok: false, response: badRequest(req, `MD5 possui no máximo ${md5MatchesRemaining} partida(s) restante(s) nesta fila`) }
    }
  }

  // ── Coaching agora exige um pacote real de um booster (booster_services,
  // service_type='coaching') — preço nunca vem do cliente, sempre lido do
  // pacote. O booster vinculado ao pedido também vem sempre do pacote,
  // nunca de preferredBoosterIdInput (evita pagar o pacote do booster A
  // mas vincular exclusividade ao booster B).
  let coachPackagePrice: number | null = null
  if (normalized.serviceType === 'coaching') {
    if (!normalized.boosterServiceId) return { ok: false, response: badRequest(req, 'Selecione um pacote de coach') }

    const { data: coachPackage, error: coachPackageErr } = await serviceClient
      .from('booster_services')
      .select('id, booster_id, price, is_active, service_type')
      .eq('id', normalized.boosterServiceId)
      .eq('service_type', 'coaching')
      .eq('is_active', true)
      .maybeSingle()
    if (coachPackageErr) return { ok: false, response: errorResponse(req, 'Failed to validate coach package', 500) }
    if (!coachPackage) return { ok: false, response: badRequest(req, 'Pacote de coach inválido ou inativo') }

    const { data: coachBoosterRow, error: coachBoosterErr } = await serviceClient
      .from('booster_profiles')
      .select('user_id')
      .eq('user_id', coachPackage.booster_id)
      .eq('status', 'approved')
      .maybeSingle()
    if (coachBoosterErr) return { ok: false, response: errorResponse(req, 'Failed to validate booster', 500) }
    if (!coachBoosterRow) return { ok: false, response: badRequest(req, 'Booster do pacote não está aprovado') }

    coachPackagePrice = Number(coachPackage.price)
    preferredBoosterId = coachBoosterRow.user_id
  }

  // ── Addons: validados contra a whitelist do fluxo E contra o catálogo
  // vivo em service_extras (ativo, do fluxo certo). Nunca aceita
  // percentual/label vindo do cliente — só o código.
  const addonCodes = [...new Set(normalized.addonCodes)]
  let extras: { id: string; code: string | null; name: string; price_modifier: number; price_modifier_pct: number; sort_order: number }[] = []

  if (hasDuplicateAddonCodes(normalized.addonCodes)) return { ok: false, response: badRequest(req, 'Addon duplicado') }

  const addonFlow: BoostFlow | null = flow ?? (
    normalized.serviceType === 'win_boost' || normalized.serviceType === 'md5' ? 'solo_standard' : null
  )

  if (addonFlow) {
    for (const code of addonCodes) {
      if (!isAddonCodeValidForFlow(addonFlow, code)) return { ok: false, response: badRequest(req, `Addon inválido para este fluxo: ${code}`) }
    }
    if (addonCodes.length > 0) {
      const { data: rows, error: extraErr } = await serviceClient
        .from('service_extras')
        .select('id, code, name, price_modifier, price_modifier_pct, sort_order')
        .eq('flow', addonFlow)
        .eq('is_active', true)
        .in('code', addonCodes)
      if (extraErr) return { ok: false, response: errorResponse(req, 'Failed to load extras', 500) }
      if (!rows || rows.length !== addonCodes.length) return { ok: false, response: badRequest(req, 'Addon inexistente ou inativo') }
      extras = rows
    }
  } else if (addonCodes.length > 0) {
    return { ok: false, response: badRequest(req, 'Addons não são aceitos para este tipo de serviço') }
  }

  const priceInput: OrderPriceInput = {
    serviceType: normalized.serviceType,
    queueType: normalized.queueType,
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
    coachPackagePrice,
  }

  const priced = computeOrderPrice(priceInput)
  if (priced.totalPrice <= 0) return { ok: false, response: badRequest(req, 'Invalid order amount') }

  return {
    ok: true,
    normalized,
    priced,
    md5MatchesRemaining,
    pdlBracket,
    coachPackagePrice,
    preferredBoosterId,
    extras,
  }
}

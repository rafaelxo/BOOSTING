// Módulo de preço — fonte única de verdade, compartilhada entre o frontend
// (Vite/React, para exibir estimativas antes do envio) e a Edge Function
// create-pix-payment (Deno, para computar o preço autoritativo do pedido).
//
// Por rodar nos dois runtimes, este arquivo não pode importar nada de
// `@/...` (alias do Vite) nem de APIs específicas de browser ou Deno —
// apenas TypeScript puro.

export type RankTier =
  | 'iron'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'emerald'
  | 'diamond'
  | 'master'
  | 'grandmaster'
  | 'challenger'

export type Division = 'I' | 'II' | 'III' | 'IV'

export type ServiceType = 'elo_boost' | 'win_boost' | 'placement_matches' | 'coaching'

export const RANK_TIER_ORDER: RankTier[] = [
  'iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond', 'master', 'grandmaster', 'challenger',
]

const DIVISIONS_ORDER: Division[] = ['IV', 'III', 'II', 'I']

export function moneyToCents(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 10_000_000) {
    throw new RangeError('Invalid monetary value')
  }
  return Math.round(value * 100)
}

export function centsToMoney(cents: number): number {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError('Invalid cent value')
  return cents / 100
}

function percentageOfCents(cents: number, percentage: number): number {
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new RangeError('Invalid percentage')
  }
  return Math.round(cents * percentage / 100)
}

export function isMasterPlus(tier: RankTier): boolean {
  return tier === 'master' || tier === 'grandmaster' || tier === 'challenger'
}

// Sequential step index: Iron IV = 0 … Diamond I = 27, Master = 28, GM = 29, Chall = 30
export function rankStep(tier: RankTier, div: Division | null): number {
  if (tier === 'master') return 28
  if (tier === 'grandmaster') return 29
  if (tier === 'challenger') return 30
  const ti = RANK_TIER_ORDER.indexOf(tier)
  const di = div ? DIVISIONS_ORDER.indexOf(div) : 0
  return ti * 4 + di
}

// ── Elo Boost ────────────────────────────────────────────────────────────────
// Preço por divisão ao ENTRAR em cada tier (BRL)
const ELO_DIV_PRICE: Record<string, number> = {
  iron: 8.50, bronze: 9.90, silver: 13.50, gold: 16.90,
  platinum: 23.90, emerald: 46.90, diamond: 74.90,
}

export const ELO_TIERS: { tier: RankTier; perDiv: number }[] = [
  { tier: 'iron',     perDiv: 8.50  },
  { tier: 'bronze',   perDiv: 9.90  },
  { tier: 'silver',   perDiv: 13.50 },
  { tier: 'gold',     perDiv: 16.90 },
  { tier: 'platinum', perDiv: 23.90 },
  { tier: 'emerald',  perDiv: 46.90 },
  { tier: 'diamond',  perDiv: 74.90 },
]

const TIER_NAMES = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond']

function divPriceForStep(step: number): number {
  const ti = Math.min(Math.floor(step / 4), 6)
  return ELO_DIV_PRICE[TIER_NAMES[ti]] ?? 74.90
}

export function calcEloPrice(
  fTier: RankTier, fDiv: Division | null,
  tTier: RankTier, tDiv: Division | null,
): { price: number; hours: number } {
  const from = rankStep(fTier, fDiv)
  const to   = rankStep(tTier, tDiv)
  if (to <= from) return { price: 0, hours: 0 }

  let priceCents = 0
  for (let s = from + 1; s <= to; s++) priceCents += moneyToCents(divPriceForStep(s))

  const hours = Math.max(1, Math.round((to - from) * 1.5))
  return { price: centsToMoney(priceCents), hours }
}

// ── Vitória Avulsa (Win Boost) ────────────────────────────────────────────────
const WIN_PRICE_PER_TIER: Record<string, number> = {
  iron: 2.90, bronze: 2.90, silver: 3.90, gold: 3.90,
  platinum: 6.90, emerald: 9.90,
  diamond: 15.90,
  master: 44.90, grandmaster: 59.90, challenger: 99.90,
}

export function getWinBoostPrice(tier: RankTier, _div: Division | null): number {
  return WIN_PRICE_PER_TIER[tier] ?? 15.90
}

// Pacotes de vitórias oferecidos no StepExtras (desconto sobre o preço unitário)
export const WIN_PACKAGE_DISCOUNTS: Record<number, number> = { 1: 10, 3: 20, 5: 30 }

// ── MD5 — 5 Placement Matches ─────────────────────────────────────────────────
export const PLACEMENT_PRICE: Record<string, number> = {
  iron: 14.90, bronze: 16.90, silver: 18.90, gold: 21.90,
  platinum: 30.90, emerald: 37.90, diamond: 41.90,
  master: 59.90, grandmaster: 59.90, challenger: 59.90,
}

// ── Duo Boost — percentual sobre o elo boost ──────────────────────────────────
// Duo Boost só existe para o fluxo padrão (Iron–Diamond) — Master+ não aceita
// Duo (ver shared/boostDomain.ts::getBoostFlow). Este percentual nunca é
// aplicado a um preço de Master+.
export const DUO_BOOST_PCT = 50

// ── Master+ — preço vem da tabela comercial `master_plus_pricing` ───────────
// Não existe fórmula de LP-alvo para Master+: o preço é definido pela regra
// comercial (origem × destino × faixa de PDL atual), consultada no banco
// pela Edge Function e repassada para computeOrderPrice via
// `input.masterPlusPrice`. Ver shared/boostDomain.ts (PDL_BRACKETS,
// MASTER_PLUS_PROGRESSIONS) e a migration que cria `master_plus_pricing`.

// ── LP Modifier for Iron–Diamond ──────────────────────────────────────────────
export function applyLpModifier(
  basePrice: number,
  fTier: RankTier,
  currentLp: number,
  avgLpGain: number,
  avgLpLoss: number,
): number {
  if (basePrice <= 0) return 0
  if (![currentLp, avgLpGain, avgLpLoss].every(Number.isFinite)
      || currentLp < 0 || currentLp > 100 || avgLpGain <= 0 || avgLpLoss <= 0) {
    throw new RangeError('Invalid LP values')
  }
  const baseCents = moneyToCents(basePrice)
  const divPriceCents = moneyToCents(ELO_DIV_PRICE[fTier] ?? 0)
  const lpDiscountCents = Math.round(currentLp * divPriceCents / 100)
  const total = avgLpGain + avgLpLoss
  const winRate = total > 0 ? avgLpGain / total : 0.5
  const efficiencyMod = 1 + (0.5 - winRate) * 0.15
  return centsToMoney(Math.max(0, Math.round((baseCents - lpDiscountCents) * efficiencyMod)))
}

// ── Preço autoritativo do pedido ──────────────────────────────────────────────
// Único ponto que decide quanto um pedido custa. Usado pelo frontend só para
// exibir uma estimativa (StepConfigure/StepExtras/StepReview); a Edge
// Function create-pix-payment é quem chama isso de fato para gravar
// base_price/extras_price/total_price em `orders` — o cliente nunca envia
// preço, só a intenção (rank, extras selecionados, pacote de vitórias etc).

export interface RankValue {
  tier: RankTier
  division: Division | null
}

export interface OrderExtraInput {
  id: string
  priceModifier: number
  priceModifierPct: number
}

export interface OrderPriceInput {
  serviceType: ServiceType
  boostMode: 'solo' | 'duo'
  currentRank: RankValue | null
  targetRank: RankValue | null
  currentLp: number
  avgLpGain: number
  avgLpLoss: number
  // Preço já consultado em `master_plus_pricing` para a combinação
  // (origem, destino, faixa de PDL atual) — null quando a faixa ainda não
  // tem preço configurado (pedido deve ser bloqueado, nunca com valor
  // inventado). Ignorado para qualquer serviceType/rank que não seja
  // elo_boost com rank atual Master+/Grão-Mestre.
  masterPlusPrice: number | null
  winsPurchased: number | null
  sessionsPurchased: number | null
  extras: OrderExtraInput[]
  winPackage: 1 | 3 | 5 | null
  // Preço do pacote de coach escolhido (booster_services.price),
  // já validado server-side contra o booster_service_id do intent — nunca
  // inventado. Ignorado para qualquer serviceType que não seja 'coaching'.
  coachPackagePrice: number | null
}

export interface OrderPriceResult {
  basePrice: number
  extrasPrice: number
  totalPrice: number
  estimatedHours: number | null
  winPackagePrice: number
  extrasBreakdown: { id: string; price: number }[]
}

export function computeOrderPrice(input: OrderPriceInput): OrderPriceResult {
  if (input.extras.length > 20) throw new RangeError('Too many extras')
  for (const extra of input.extras) {
    moneyToCents(extra.priceModifier)
    if (!Number.isFinite(extra.priceModifierPct) || extra.priceModifierPct < 0 || extra.priceModifierPct > 100) {
      throw new RangeError('Invalid extra percentage')
    }
  }
  let basePrice = 0
  let estimatedHours: number | null = null

  switch (input.serviceType) {
    case 'elo_boost': {
      const { currentRank, targetRank, boostMode, currentLp, avgLpGain, avgLpLoss } = input
      if (!currentRank) break

      if (isMasterPlus(currentRank.tier)) {
        // Master+ não aceita Duo — basePrice fica 0 (bloqueado) se boostMode
        // vier 'duo' aqui; a rejeição explícita acontece antes disso, na
        // validação de fluxo (getBoostFlow retorna null para essa combinação).
        if (boostMode === 'duo' || input.masterPlusPrice == null) break
        basePrice = centsToMoney(moneyToCents(input.masterPlusPrice))
        estimatedHours = null
      } else {
        if (!targetRank) break
        const { price, hours } = calcEloPrice(
          currentRank.tier, currentRank.division,
          targetRank.tier, targetRank.division,
        )
        const withLp = applyLpModifier(price, currentRank.tier, currentLp, avgLpGain, avgLpLoss)
        basePrice = boostMode === 'duo'
          ? centsToMoney(moneyToCents(withLp) + percentageOfCents(moneyToCents(withLp), DUO_BOOST_PCT))
          : centsToMoney(moneyToCents(withLp))
        estimatedHours = hours || null
      }
      break
    }
    case 'placement_matches': {
      if (!input.currentRank) break
      basePrice = PLACEMENT_PRICE[input.currentRank.tier] ?? 15
      estimatedHours = 3
      break
    }
    case 'win_boost': {
      if (!input.winsPurchased || !input.currentRank) break
      const pricePerWin = getWinBoostPrice(input.currentRank.tier, input.currentRank.division)
      basePrice = centsToMoney(input.winsPurchased * moneyToCents(pricePerWin))
      estimatedHours = Math.max(1, Math.round(input.winsPurchased * 0.4))
      break
    }
    case 'coaching': {
      basePrice = input.coachPackagePrice ?? 0
      estimatedHours = input.sessionsPurchased ?? 1
      break
    }
  }

  const basePriceCents = moneyToCents(basePrice)
  const extrasBreakdown = input.extras.map((e) => ({
    id: e.id,
    price: centsToMoney(e.priceModifier > 0
      ? moneyToCents(e.priceModifier)
      : e.priceModifierPct > 0
        ? percentageOfCents(basePriceCents, e.priceModifierPct)
        : 0),
  }))

  const extrasRawCents = extrasBreakdown.reduce((sum, e) => sum + moneyToCents(e.price), 0)

  let winPackagePrice = 0
  if (input.winPackage && input.currentRank) {
    const pricePerWin = getWinBoostPrice(input.currentRank.tier, input.currentRank.division)
    const discountPct = WIN_PACKAGE_DISCOUNTS[input.winPackage] ?? 0
    const undiscountedCents = moneyToCents(pricePerWin) * input.winPackage
    winPackagePrice = centsToMoney(undiscountedCents - percentageOfCents(undiscountedCents, discountPct))
  }

  const extrasPriceCents = extrasRawCents + moneyToCents(winPackagePrice)
  const extrasPrice = centsToMoney(extrasPriceCents)
  const totalPrice = centsToMoney(basePriceCents + extrasPriceCents)

  return { basePrice, extrasPrice, totalPrice, estimatedHours, winPackagePrice, extrasBreakdown }
}

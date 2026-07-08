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

  let price = 0
  for (let s = from + 1; s <= to; s++) price += divPriceForStep(s)

  const hours = Math.max(1, Math.round((to - from) * 1.5))
  return { price: Math.round(price * 100) / 100, hours }
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

// ── Coaching — valor a combinar por sessão ────────────────────────────────────
export const COACHING_PRICE_NEGOTIABLE = true

// ── Duo Boost — percentual sobre o elo boost ──────────────────────────────────
export const DUO_BOOST_PCT = 50

// ── Master+ LP-based pricing ──────────────────────────────────────────────────
const MASTER_LP_RATE: Record<string, number> = {
  master: 0.45,
  grandmaster: 0.75,
  challenger: 1.20,
}

export function calcMasterPlusPrice(tier: RankTier, currentLp: number, targetLp: number): number {
  const rate = MASTER_LP_RATE[tier] ?? 0.45
  return Math.max(0, Math.round((targetLp - currentLp) * rate * 100) / 100)
}

// ── LP Modifier for Iron–Diamond ──────────────────────────────────────────────
export function applyLpModifier(
  basePrice: number,
  fTier: RankTier,
  currentLp: number,
  avgLpGain: number,
  avgLpLoss: number,
): number {
  if (basePrice <= 0) return 0
  const divPrice = ELO_DIV_PRICE[fTier] ?? 0
  const lpDiscount = (currentLp / 100) * divPrice
  const total = avgLpGain + avgLpLoss
  const winRate = total > 0 ? avgLpGain / total : 0.5
  const efficiencyMod = 1 + (0.5 - winRate) * 0.15
  return Math.max(0, Math.round((basePrice - lpDiscount) * efficiencyMod * 100) / 100)
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
  targetLp: number | null
  winsPurchased: number | null
  sessionsPurchased: number | null
  extras: OrderExtraInput[]
  winPackage: 1 | 3 | 5 | null
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
  let basePrice = 0
  let estimatedHours: number | null = null

  switch (input.serviceType) {
    case 'elo_boost': {
      const { currentRank, targetRank, boostMode, currentLp, avgLpGain, avgLpLoss, targetLp } = input
      if (!currentRank) break

      if (isMasterPlus(currentRank.tier)) {
        if (targetLp === null || targetLp <= currentLp) break
        const price = calcMasterPlusPrice(currentRank.tier, currentLp, targetLp)
        basePrice = boostMode === 'duo'
          ? Math.round(price * (1 + DUO_BOOST_PCT / 100) * 100) / 100
          : price
        estimatedHours = Math.max(1, Math.round((targetLp - currentLp) / 25))
      } else {
        if (!targetRank) break
        const { price, hours } = calcEloPrice(
          currentRank.tier, currentRank.division,
          targetRank.tier, targetRank.division,
        )
        const withLp = applyLpModifier(price, currentRank.tier, currentLp, avgLpGain, avgLpLoss)
        basePrice = boostMode === 'duo'
          ? Math.round(withLp * (1 + DUO_BOOST_PCT / 100) * 100) / 100
          : withLp
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
      basePrice = Math.round(input.winsPurchased * pricePerWin * 100) / 100
      estimatedHours = Math.max(1, Math.round(input.winsPurchased * 0.4))
      break
    }
    case 'coaching': {
      basePrice = 0
      estimatedHours = input.sessionsPurchased ?? 1
      break
    }
  }

  const extrasBreakdown = input.extras.map((e) => ({
    id: e.id,
    price: e.priceModifier > 0
      ? e.priceModifier
      : e.priceModifierPct > 0
        ? Math.round(basePrice * e.priceModifierPct) / 100
        : 0,
  }))

  const extrasRaw = extrasBreakdown.reduce((sum, e) => sum + e.price, 0)

  let winPackagePrice = 0
  if (input.winPackage && input.currentRank) {
    const pricePerWin = getWinBoostPrice(input.currentRank.tier, input.currentRank.division)
    const discountPct = WIN_PACKAGE_DISCOUNTS[input.winPackage] ?? 0
    winPackagePrice = Math.round(pricePerWin * input.winPackage * (1 - discountPct / 100) * 100) / 100
  }

  const extrasPrice = Math.round((extrasRaw + winPackagePrice) * 100) / 100
  const totalPrice = Math.round((basePrice + extrasPrice) * 100) / 100

  return { basePrice, extrasPrice, totalPrice, estimatedHours, winPackagePrice, extrasBreakdown }
}

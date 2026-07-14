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

export type ServiceType = 'elo_boost' | 'win_boost' | 'placement_matches' | 'coaching' | 'md5'

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

export type QueueType = 'solo_duo' | 'flex'

// ── Elo Boost — preço por divisão ao ENTRAR em cada tier, em CENTAVOS ───────
// Tabela oficial por fila. Master+ não usa esta tabela — vem de
// `master_plus_pricing` no banco (ver shared/boostDomain.ts e a migration
// que cria essa tabela).
const ELO_DIV_PRICE_CENTS: Record<QueueType, Record<string, number>> = {
  solo_duo: {
    iron: 850, bronze: 990, silver: 1350, gold: 1690,
    platinum: 2390, emerald: 4690, diamond: 7490,
  },
  flex: {
    iron: 800, bronze: 940, silver: 1280, gold: 1590,
    platinum: 2270, emerald: 4450, diamond: 7110,
  },
}

// Tabela usada só pela página pública de preços (sem seleção de fila) —
// reflete a fila solo_duo, a padrão exibida antes do configurador.
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

export function getEloDivPrice(queue: QueueType, tier: RankTier): number {
  return centsToMoney(ELO_DIV_PRICE_CENTS[queue][tier] ?? ELO_DIV_PRICE_CENTS[queue].diamond)
}

function divPriceCentsForStep(queue: QueueType, step: number): number {
  const ti = Math.min(Math.floor(step / 4), 6)
  return ELO_DIV_PRICE_CENTS[queue][TIER_NAMES[ti]] ?? ELO_DIV_PRICE_CENTS[queue].diamond
}

export function calcEloPrice(
  queue: QueueType,
  fTier: RankTier, fDiv: Division | null,
  tTier: RankTier, tDiv: Division | null,
): { price: number; hours: number } {
  const from = rankStep(fTier, fDiv)
  const to = rankStep(tTier, tDiv)
  if (to <= from) return { price: 0, hours: 0 }

  let priceCents = 0
  for (let s = from + 1; s <= to; s++) priceCents += divPriceCentsForStep(queue, s)

  const hours = Math.max(1, Math.round((to - from) * 1.5))
  return { price: centsToMoney(priceCents), hours }
}

// ── Vitória Avulsa (Win Boost) — preço por vitória, em CENTAVOS ─────────────
const WIN_PRICE_CENTS: Record<QueueType, Record<string, number>> = {
  solo_duo: {
    iron: 290, bronze: 290, silver: 390, gold: 390, platinum: 690,
    emerald: 990, diamond: 1590, master: 4490, grandmaster: 5990, challenger: 9990,
  },
  flex: {
    iron: 265, bronze: 265, silver: 370, gold: 370, platinum: 650,
    emerald: 940, diamond: 1510, master: 4490, grandmaster: 5990, challenger: 9990,
  },
}

export function getWinBoostPrice(queue: QueueType, tier: RankTier, _div?: Division | null): number {
  return centsToMoney(WIN_PRICE_CENTS[queue][tier] ?? WIN_PRICE_CENTS[queue].diamond)
}

// Pacotes de vitórias oferecidos no StepExtras (desconto sobre o preço unitário)
export const WIN_PACKAGE_DISCOUNTS: Record<number, number> = { 1: 10, 3: 20, 5: 30 }

// ── MD5 — garantia de win rate, preço por vitória líquida, em CENTAVOS ──────
// Tabela direta por fila — não é mais derivada de PLACEMENT_PRICE ÷ 5.
const MD5_WIN_PRICE_CENTS: Record<QueueType, Record<string, number>> = {
  solo_duo: {
    iron: 1490, bronze: 1690, silver: 1890, gold: 2190, platinum: 3090,
    emerald: 3790, diamond: 4190, master: 5990, grandmaster: 9990, challenger: 17990,
  },
  flex: {
    iron: 1410, bronze: 1590, silver: 1790, gold: 2080, platinum: 2930,
    emerald: 3600, diamond: 3990, master: 5990, grandmaster: 9990, challenger: 17990,
  },
}

export function getMd5WinPrice(queue: QueueType, tier: RankTier): number {
  return centsToMoney(MD5_WIN_PRICE_CENTS[queue][tier] ?? MD5_WIN_PRICE_CENTS[queue].diamond)
}

// ── MD5 Completo (placement_matches) — legado, mantido só para pedidos
// antigos e cálculo de preço histórico. Não oferecido como serviço novo
// (StepService.tsx não lista mais este tile) — ver Task 6.
export const PLACEMENT_PRICE: Record<string, number> = {
  iron: 14.90, bronze: 16.90, silver: 18.90, gold: 21.90,
  platinum: 30.90, emerald: 37.90, diamond: 41.90,
  master: 59.90, grandmaster: 99.90, challenger: 179.90,
}

// ── Elo Boost Master+ — transições oficiais (mesmo valor nas duas filas) ────
// Fonte de referência apenas — o preço autoritativo por faixa de PDL vem da
// tabela `master_plus_pricing` (ver migration 020), que a Task 3 atualiza
// para bater com estes valores em todas as 4 faixas de PDL (o negócio não
// diferenciou por faixa nesta rodada — mesmo valor nas 4).
export const MASTER_PLUS_TRANSITION_PRICE_CENTS = {
  master_to_grandmaster: 89990,
  grandmaster_to_challenger: 124990,
} as const

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
// Percentual de eficiência aplicado conforme a média de LP por partida —
// função isolada para que `applyLpModifier` e `computeOrderPrice` consultem
// os mesmos limiares (19/20/25/26) sem duas checagens independentes
// divergirem no futuro.
export function lpModifierPct(avgLpPerGame: number): number {
  if (avgLpPerGame < 20) return 15
  if (avgLpPerGame > 25) return -5
  return 0
}

export function applyLpModifier(
  basePrice: number,
  fTier: RankTier,
  currentLp: number,
  avgLpPerGame: number,
  _avgLpLoss?: number,
  queueType: QueueType = 'solo_duo',
): number {
  if (basePrice <= 0) return 0
  if (![currentLp, avgLpPerGame].every(Number.isFinite)
      || currentLp < 0 || currentLp > 100 || avgLpPerGame <= 0) {
    throw new RangeError('Invalid LP values')
  }
  const baseCents = moneyToCents(basePrice)
  const divPriceCents = moneyToCents(getEloDivPrice(queueType, fTier))
  const lpDiscountCents = Math.round(currentLp * divPriceCents / 100)
  const pct = lpModifierPct(avgLpPerGame)
  const efficiencyMod = 1 + pct / 100
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
  queueType: QueueType
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
  // Percentual de modificador de PDL efetivamente aplicado (-5, 0 ou +15) —
  // só existe no fluxo padrão elo_boost (Iron–Diamond); `null` para Master+
  // e para qualquer outro serviceType, onde este modificador nunca se aplica.
  pdlModifierPct: number | null
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
  let pdlModifierPct: number | null = null

  switch (input.serviceType) {
    case 'elo_boost': {
      const { currentRank, targetRank, boostMode, currentLp, avgLpGain, avgLpLoss } = input
      if (!currentRank) break

      if (isMasterPlus(currentRank.tier)) {
        // Master+ não aceita Duo — basePrice fica 0 (bloqueado) se boostMode
        // vier 'duo' aqui; a rejeição explícita acontece antes disso, na
        // validação de fluxo (getBoostFlow retorna null para essa combinação).
        // O modificador de PDL nunca se aplica ao Master+ — pdlModifierPct
        // permanece null.
        if (boostMode === 'duo' || input.masterPlusPrice == null) break
        basePrice = centsToMoney(moneyToCents(input.masterPlusPrice))
        estimatedHours = null
      } else {
        if (!targetRank) break
        const { price, hours } = calcEloPrice(
          input.queueType,
          currentRank.tier, currentRank.division,
          targetRank.tier, targetRank.division,
        )
        const withLp = applyLpModifier(price, currentRank.tier, currentLp, avgLpGain, avgLpLoss, input.queueType)
        basePrice = boostMode === 'duo'
          ? centsToMoney(moneyToCents(withLp) + percentageOfCents(moneyToCents(withLp), DUO_BOOST_PCT))
          : centsToMoney(moneyToCents(withLp))
        estimatedHours = hours || null
        pdlModifierPct = lpModifierPct(avgLpGain)
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
      const pricePerWin = getWinBoostPrice(input.queueType, input.currentRank.tier, input.currentRank.division)
      basePrice = centsToMoney(input.winsPurchased * moneyToCents(pricePerWin))
      estimatedHours = Math.max(1, Math.round(input.winsPurchased * 0.4))
      break
    }
    case 'md5': {
      if (!input.winsPurchased || !input.currentRank) break
      if (input.winsPurchased < 1 || input.winsPurchased > 5) break
      const pricePerWin = getMd5WinPrice(input.queueType, input.currentRank.tier)
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
    const pricePerWin = getWinBoostPrice(input.queueType, input.currentRank.tier, input.currentRank.division)
    const discountPct = WIN_PACKAGE_DISCOUNTS[input.winPackage] ?? 0
    const undiscountedCents = moneyToCents(pricePerWin) * input.winPackage
    winPackagePrice = centsToMoney(undiscountedCents - percentageOfCents(undiscountedCents, discountPct))
  }

  const extrasPriceCents = extrasRawCents + moneyToCents(winPackagePrice)
  const extrasPrice = centsToMoney(extrasPriceCents)
  const totalPrice = centsToMoney(basePriceCents + extrasPriceCents)

  return { basePrice, extrasPrice, totalPrice, estimatedHours, winPackagePrice, extrasBreakdown, pdlModifierPct }
}

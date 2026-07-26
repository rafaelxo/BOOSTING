// shared/clashDomain.ts
// Domínio do serviço Clash (Solo Clash / Duo Clash) — mesmo papel que
// shared/boostDomain.ts tem para o Elo Boost: fluxos, addons válidos por
// fluxo, e rótulos de exibição. O preço em si (tabela + computeOrderPrice)
// vive em shared/pricing.ts, igual ao Elo Boost.
//
// Roda nos dois runtimes (Vite/React e a Edge Function Deno
// create-pix-payment) — não importe nada de `@/...` nem de APIs específicas
// de browser/Deno aqui.

import type { ClashDay, ClashTier, RankTier } from './pricing.ts'
import type { BoostMode } from './boostDomain.ts'

export const CLASH_TIER_LABEL: Record<ClashTier, string> = {
  tier_4: 'Tier 4',
  tier_3: 'Tier 3',
  tier_2: 'Tier 2',
  tier_1: 'Tier 1',
}

export const CLASH_TIER_RANGE_LABEL: Record<ClashTier, string> = {
  tier_4: 'Ferro – Prata',
  tier_3: 'Ouro',
  tier_2: 'Platina – Esmeralda',
  tier_1: 'Diamante – Desafiante',
}

// Ranks aceitos em cada tier — referência de validação/exibição. O pedido
// grava só o tier escolhido (orders.clash_tier), nunca um rank+divisão
// específico como o Elo Boost.
export const CLASH_TIER_RANK_TIERS: Record<ClashTier, RankTier[]> = {
  tier_4: ['iron', 'bronze', 'silver'],
  tier_3: ['gold'],
  tier_2: ['platinum', 'emerald'],
  tier_1: ['diamond', 'master', 'grandmaster', 'challenger'],
}

// Rank mais baixo/mais alto de cada tier — só pra exibir os dois ícones de
// fronteira no seletor (RankBadge); nunca gravado no pedido.
export const CLASH_TIER_BOUNDARY_RANKS: Record<ClashTier, { low: RankTier; high: RankTier }> = {
  tier_4: { low: 'iron', high: 'silver' },
  tier_3: { low: 'gold', high: 'gold' },
  tier_2: { low: 'platinum', high: 'emerald' },
  tier_1: { low: 'diamond', high: 'challenger' },
}

export const CLASH_DAY_LABEL: Record<ClashDay, string> = {
  saturday: 'Sábado',
  sunday: 'Domingo',
}

// Namespace de addons do Clash, deliberadamente separado de BoostFlow
// (shared/boostDomain.ts). BoostFlow é uma union fechada (Record-keyed) só
// para lógica exclusiva do elo_boost (Master+, modificador de LP) —
// misturar Clash ali obrigaria todo switch sobre BoostFlow a ganhar um
// branch irrelevante. Mesma "whitelist estrutural + service_extras como
// conteúdo" que BOOST_ADDON_CODES já usa (ver boostDomain.ts).
export type ClashFlow = 'clash_solo' | 'clash_duo'

export function getClashFlow(mode: BoostMode): ClashFlow {
  return mode === 'duo' ? 'clash_duo' : 'clash_solo'
}

// Vazio nas duas modalidades no lançamento — nenhum addon de Clash foi
// definido ainda. Preparado pra receber códigos depois (nova linha em
// service_extras com flow='clash_solo'/'clash_duo' + o code adicionado
// aqui) — mesma dupla trava que BOOST_ADDON_CODES: um código só é aceito se
// estiver aqui E existir uma linha ativa em service_extras.
export const CLASH_ADDON_CODES: Record<ClashFlow, readonly string[]> = {
  clash_solo: [],
  clash_duo: [],
}

export function isClashAddonCodeValidForFlow(flow: ClashFlow, code: string): boolean {
  return CLASH_ADDON_CODES[flow].includes(code)
}

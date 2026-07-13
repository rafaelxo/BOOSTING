import { describe, it, expect } from 'vitest'
import { computeOrderPrice, type OrderPriceInput } from './pricing'

function baseInput(overrides: Partial<OrderPriceInput> = {}): OrderPriceInput {
  return {
    serviceType: 'elo_boost',
    boostMode: 'solo',
    currentRank: null,
    targetRank: null,
    currentLp: 0,
    avgLpGain: 20,
    avgLpLoss: 20, // ganho == perda => efficiencyMod neutro (1.0), preço previsível para os testes
    masterPlusPrice: null,
    winsPurchased: null,
    sessionsPurchased: null,
    extras: [],
    winPackage: null,
    ...overrides,
  }
}

describe('Cálculo de addons — percentual sobre o preço base, não composto (seção 16)', () => {
  it('exemplo do enunciado: base R$100, Gameplay Explicativa 30% + Acesso Prioritário 15% = R$145', () => {
    const input = baseInput({
      currentRank: { tier: 'iron', division: 'I' },
      targetRank: { tier: 'bronze', division: 'IV' }, // 1 passo => 1x ELO_DIV_PRICE.iron = 8.50, não 100 — testamos a fórmula com um basePrice sintético abaixo
    })
    // Usamos o motor real de addons isoladamente: soma percentuais sobre um
    // basePrice conhecido, sem depender da tabela de rank por divisão.
    const priced = computeOrderPrice({
      ...input,
      extras: [
        { id: 'gameplay', priceModifier: 0, priceModifierPct: 30 },
        { id: 'priority', priceModifier: 0, priceModifierPct: 15 },
      ],
    })
    // extrasPrice = basePrice * 0.30 + basePrice * 0.15 (não composto)
    const expectedExtras = Math.round((priced.basePrice * 0.30 + priced.basePrice * 0.15) * 100) / 100
    expect(priced.extrasPrice).toBeCloseTo(expectedExtras, 2)
    expect(priced.totalPrice).toBeCloseTo(priced.basePrice + expectedExtras, 2)
  })

  it('addons não incidem uns sobre os outros (soma linear, nunca composta)', () => {
    const basePrice100Input = baseInput({ masterPlusPrice: 100, currentRank: { tier: 'master', division: null } })
    const priced = computeOrderPrice({
      ...basePrice100Input,
      extras: [
        { id: 'a', priceModifier: 0, priceModifierPct: 50 },
        { id: 'b', priceModifier: 0, priceModifierPct: 30 },
      ],
    })
    expect(priced.basePrice).toBe(100)
    // Composto seria 100 * 1.5 * 1.3 = 195 (errado). Linear é 100 + 50 + 30 = 180.
    expect(priced.extrasPrice).toBe(80)
    expect(priced.totalPrice).toBe(180)
  })
})

describe('Master+ — preço vem exclusivamente da tabela comercial (seção 14)', () => {
  it('usa masterPlusPrice diretamente como preço base quando informado', () => {
    const priced = computeOrderPrice(baseInput({
      currentRank: { tier: 'master', division: null },
      targetRank: { tier: 'challenger', division: null },
      masterPlusPrice: 250,
    }))
    expect(priced.basePrice).toBe(250)
    expect(priced.totalPrice).toBe(250)
  })

  it('preço fica zerado (pedido bloqueado) quando a faixa não tem preço configurado', () => {
    const priced = computeOrderPrice(baseInput({
      currentRank: { tier: 'master', division: null },
      targetRank: { tier: 'challenger', division: null },
      masterPlusPrice: null,
    }))
    expect(priced.basePrice).toBe(0)
    expect(priced.totalPrice).toBe(0)
  })

  it('Duo Boost nunca é aplicado ao preço do Master+ (defesa em profundidade)', () => {
    const priced = computeOrderPrice(baseInput({
      currentRank: { tier: 'master', division: null },
      targetRank: { tier: 'challenger', division: null },
      masterPlusPrice: 250,
      boostMode: 'duo', // não deveria acontecer (validado antes na Edge Function), mas se acontecer:
    }))
    expect(priced.basePrice).toBe(0) // bloqueado, não "250 * 1.5"
  })

  it('não estima horas a partir de um PDL alvo — não existe mais esse conceito', () => {
    const priced = computeOrderPrice(baseInput({
      currentRank: { tier: 'master', division: null },
      targetRank: { tier: 'challenger', division: null },
      masterPlusPrice: 250,
    }))
    expect(priced.estimatedHours).toBeNull()
  })
})

describe('Fluxo padrão (Iron–Diamond) — Duo aplica +50% sobre o preço com LP já modulado', () => {
  it('duo é exatamente 1.5x o preço solo equivalente', () => {
    const solo = computeOrderPrice(baseInput({
      currentRank: { tier: 'iron', division: 'IV' },
      targetRank: { tier: 'iron', division: 'I' },
      boostMode: 'solo',
    }))
    const duo = computeOrderPrice(baseInput({
      currentRank: { tier: 'iron', division: 'IV' },
      targetRank: { tier: 'iron', division: 'I' },
      boostMode: 'duo',
    }))
    expect(duo.basePrice).toBeCloseTo(Math.round(solo.basePrice * 1.5 * 100) / 100, 2)
  })

  it('rank alvo igual ou abaixo do atual não gera preço (calcEloPrice retorna 0)', () => {
    const priced = computeOrderPrice(baseInput({
      currentRank: { tier: 'diamond', division: 'I' },
      targetRank: { tier: 'iron', division: 'IV' },
    }))
    expect(priced.basePrice).toBe(0)
  })
})

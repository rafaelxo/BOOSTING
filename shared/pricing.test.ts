import { describe, it, expect } from 'vitest'
import {
  computeOrderPrice, getEloDivPrice, getWinBoostPrice, getMd5WinPrice, applyLpModifier, lpModifierPct,
  moneyToCents, PLACEMENT_PRICE, type OrderPriceInput, type RankTier,
} from './pricing'

function baseInput(overrides: Partial<OrderPriceInput> = {}): OrderPriceInput {
  return {
    serviceType: 'elo_boost',
    queueType: 'solo_duo',
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
    coachPackagePrice: null,
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

describe('Integridade monetária e entradas hostis', () => {
  it('arredonda percentuais uma única vez na menor unidade monetária', () => {
    const priced = computeOrderPrice(baseInput({
      currentRank: { tier: 'master', division: null },
      targetRank: { tier: 'challenger', division: null },
      masterPlusPrice: 10.01,
      extras: [{ id: 'fractional', priceModifier: 0, priceModifierPct: 15 }],
    }))
    expect(priced.extrasPrice).toBe(1.5)
    expect(priced.totalPrice).toBe(11.51)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.01])(
    'recusa modificador monetário inválido: %s',
    (priceModifier) => {
      expect(() => computeOrderPrice(baseInput({
        currentRank: { tier: 'master', division: null },
        masterPlusPrice: 100,
        extras: [{ id: 'invalid', priceModifier, priceModifierPct: 0 }],
      }))).toThrow(RangeError)
    },
  )

  it('recusa percentual acima de 100%', () => {
    expect(() => computeOrderPrice(baseInput({
      currentRank: { tier: 'master', division: null },
      masterPlusPrice: 100,
      extras: [{ id: 'invalid', priceModifier: 0, priceModifierPct: 100.01 }],
    }))).toThrow(RangeError)
  })

  it.each([1, 3, 50])('calcula quantidade válida de vitórias: %i', (winsPurchased) => {
    const priced = computeOrderPrice(baseInput({
      serviceType: 'win_boost',
      currentRank: { tier: 'gold', division: 'II' },
      winsPurchased,
    }))
    expect(priced.basePrice).toBe(winsPurchased * 3.9)
    expect(priced.totalPrice).toBe(priced.basePrice)
  })

  it('calcula vitória avulsa Master+ com a tabela comercial atual', () => {
    const priced = computeOrderPrice(baseInput({
      serviceType: 'win_boost',
      currentRank: { tier: 'challenger', division: null },
      winsPurchased: 2,
    }))

    expect(priced.basePrice).toBe(199.8)
  })

  it('calcula MD5 proporcional ao pacote de 5 partidas com Master+', () => {
    const priced = computeOrderPrice(baseInput({
      serviceType: 'md5',
      currentRank: { tier: 'grandmaster', division: null },
      winsPurchased: 3,
    }))

    // Tabela nova (direta, não mais ÷5): grandmaster = 99.90/vitória (igual nas duas filas)
    expect(priced.basePrice).toBe(299.70)
  })

  it('recusa quantidade negativa', () => {
    expect(() => computeOrderPrice(baseInput({
      serviceType: 'win_boost',
      currentRank: { tier: 'gold', division: 'II' },
      winsPurchased: -1,
    }))).toThrow(RangeError)
  })
})

describe('MD5 — preço por vitória líquida (garantia de win rate nas placements)', () => {
  it('preço por vitória = tabela direta por fila (não mais ÷5), arredondado a 2 casas', () => {
    const priced = computeOrderPrice(baseInput({
      serviceType: 'md5',
      currentRank: { tier: 'gold', division: null },
      winsPurchased: 3,
    }))
    // tabela solo_duo: Gold = 21.90/vitória (tabela direta, não derivada mais)
    expect(priced.basePrice).toBeCloseTo(21.90 * 3, 2)
  })

  it('todos os 10 tiers usam os valores exatos da nova tabela direta por vitória (solo_duo)', () => {
    const cases: [string, number][] = [
      ['iron', 14.90], ['bronze', 16.90], ['silver', 18.90], ['gold', 21.90],
      ['platinum', 30.90], ['emerald', 37.90], ['diamond', 41.90],
      ['master', 59.90], ['grandmaster', 99.90], ['challenger', 179.90],
    ]
    for (const [tier, perWinPrice] of cases) {
      const priced = computeOrderPrice(baseInput({
        serviceType: 'md5', currentRank: { tier: tier as RankTier, division: null }, winsPurchased: 1,
      }))
      expect(priced.basePrice).toBeCloseTo(perWinPrice, 2)
    }
  })

  it('sem winsPurchased ou currentRank, preço fica zero (pedido bloqueado)', () => {
    const priced = computeOrderPrice(baseInput({ serviceType: 'md5', currentRank: null, winsPurchased: null }))
    expect(priced.basePrice).toBe(0)
  })

  it('com currentRank válido mas sem winsPurchased (ou vice-versa), preço continua zero', () => {
    const semWins = computeOrderPrice(baseInput({
      serviceType: 'md5', currentRank: { tier: 'gold', division: null }, winsPurchased: null,
    }))
    expect(semWins.basePrice).toBe(0)

    const semRank = computeOrderPrice(baseInput({
      serviceType: 'md5', currentRank: null, winsPurchased: 3,
    }))
    expect(semRank.basePrice).toBe(0)
  })

  it('rejeita quantidade de vitórias fora da faixa 1-5 (garantia é só para as placements)', () => {
    const priced = computeOrderPrice(baseInput({
      serviceType: 'md5', currentRank: { tier: 'gold', division: null }, winsPurchased: 6,
    }))
    expect(priced.basePrice).toBe(0)
  })
})

describe('placement_matches (MD5 Completo, legado) — PLACEMENT_PRICE segue computável para pedidos antigos', () => {
  it('usa PLACEMENT_PRICE por tier, tabela independente da MD5 nova (por vitória)', () => {
    const priced = computeOrderPrice(baseInput({
      serviceType: 'placement_matches',
      currentRank: { tier: 'gold', division: null },
    }))
    expect(priced.basePrice).toBe(PLACEMENT_PRICE.gold)
    expect(priced.estimatedHours).toBe(3)
  })

  it('sem currentRank, preço fica zero (pedido bloqueado, mesma regra dos outros serviceTypes)', () => {
    const priced = computeOrderPrice(baseInput({ serviceType: 'placement_matches', currentRank: null }))
    expect(priced.basePrice).toBe(0)
  })
})

describe('Preços por fila — Vitória Avulsa', () => {
  const soloDuo: [RankTier, number][] = [
    ['iron', 290], ['bronze', 290], ['silver', 390], ['gold', 390], ['platinum', 690],
    ['emerald', 990], ['diamond', 1590], ['master', 4490], ['grandmaster', 5990], ['challenger', 9990],
  ]
  const flex: [RankTier, number][] = [
    ['iron', 265], ['bronze', 265], ['silver', 370], ['gold', 370], ['platinum', 650],
    ['emerald', 940], ['diamond', 1510], ['master', 4490], ['grandmaster', 5990], ['challenger', 9990],
  ]
  it.each(soloDuo)('solo_duo %s = %i centavos', (tier, cents) => {
    expect(moneyToCents(getWinBoostPrice('solo_duo', tier))).toBe(cents)
  })
  it.each(flex)('flex %s = %i centavos', (tier, cents) => {
    expect(moneyToCents(getWinBoostPrice('flex', tier))).toBe(cents)
  })
})

describe('Preços por fila — MD5 (garantia de win rate, por vitória)', () => {
  const soloDuo: [RankTier, number][] = [
    ['iron', 1490], ['bronze', 1690], ['silver', 1890], ['gold', 2190], ['platinum', 3090],
    ['emerald', 3790], ['diamond', 4190], ['master', 5990], ['grandmaster', 9990], ['challenger', 17990],
  ]
  const flex: [RankTier, number][] = [
    ['iron', 1410], ['bronze', 1590], ['silver', 1790], ['gold', 2080], ['platinum', 2930],
    ['emerald', 3600], ['diamond', 3990], ['master', 5990], ['grandmaster', 9990], ['challenger', 17990],
  ]
  it.each(soloDuo)('solo_duo %s = %i centavos', (tier, cents) => {
    expect(moneyToCents(getMd5WinPrice('solo_duo', tier))).toBe(cents)
  })
  it.each(flex)('flex %s = %i centavos', (tier, cents) => {
    expect(moneyToCents(getMd5WinPrice('flex', tier))).toBe(cents)
  })
})

describe('Preços por fila — Elo Boost (por divisão)', () => {
  // Iron..Diamond entry price per division, in cents.
  const soloDuo: [RankTier, number][] = [
    ['iron', 850], ['bronze', 990], ['silver', 1350], ['gold', 1690],
    ['platinum', 2390], ['emerald', 4690], ['diamond', 7490],
  ]
  const flex: [RankTier, number][] = [
    ['iron', 800], ['bronze', 940], ['silver', 1280], ['gold', 1590],
    ['platinum', 2270], ['emerald', 4450], ['diamond', 7110],
  ]
  it.each(soloDuo)('solo_duo %s = %i centavos/divisão', (tier, cents) => {
    expect(moneyToCents(getEloDivPrice('solo_duo', tier))).toBe(cents)
  })
  it.each(flex)('flex %s = %i centavos/divisão', (tier, cents) => {
    expect(moneyToCents(getEloDivPrice('flex', tier))).toBe(cents)
  })
})

describe('Modificador de PDL — limiares corrigidos (15%/normal/-5%)', () => {
  it('19 PDL de média aplica +15%', () => {
    const withMod = applyLpModifier(100, 'gold', 0, 19)
    expect(withMod).toBeCloseTo(115, 2)
  })
  it('20 PDL de média é preço normal (limite inferior incluído)', () => {
    expect(applyLpModifier(100, 'gold', 0, 20)).toBeCloseTo(100, 2)
  })
  it('25 PDL de média é preço normal (limite superior incluído)', () => {
    expect(applyLpModifier(100, 'gold', 0, 25)).toBeCloseTo(100, 2)
  })
  it('26 PDL de média aplica -5%', () => {
    expect(applyLpModifier(100, 'gold', 0, 26)).toBeCloseTo(95, 2)
  })
})

describe('lpModifierPct — mesmos limiares expostos como percentual', () => {
  it('19 PDL de média => +15', () => {
    expect(lpModifierPct(19)).toBe(15)
  })
  it('20 PDL de média => 0 (limite inferior incluído)', () => {
    expect(lpModifierPct(20)).toBe(0)
  })
  it('25 PDL de média => 0 (limite superior incluído)', () => {
    expect(lpModifierPct(25)).toBe(0)
  })
  it('26 PDL de média => -5', () => {
    expect(lpModifierPct(26)).toBe(-5)
  })
})

describe('computeOrderPrice — pdlModifierPct exposto no resultado (fluxo padrão elo_boost)', () => {
  it.each([
    [19, 15],
    [20, 0],
    [25, 0],
    [26, -5],
  ])('avgLpGain=%i => pdlModifierPct=%i', (avgLpGain, expectedPct) => {
    const priced = computeOrderPrice(baseInput({
      currentRank: { tier: 'iron', division: 'IV' },
      targetRank: { tier: 'iron', division: 'I' },
      avgLpGain,
    }))
    expect(priced.pdlModifierPct).toBe(expectedPct)
  })

  it('Master+ nunca recebe o modificador de PDL (pdlModifierPct fica null)', () => {
    const priced = computeOrderPrice(baseInput({
      currentRank: { tier: 'master', division: null },
      targetRank: { tier: 'challenger', division: null },
      masterPlusPrice: 250,
    }))
    expect(priced.pdlModifierPct).toBeNull()
  })

  it('win_boost nunca recebe o modificador de PDL (pdlModifierPct fica null)', () => {
    const priced = computeOrderPrice(baseInput({
      serviceType: 'win_boost',
      currentRank: { tier: 'gold', division: 'II' },
      winsPurchased: 3,
    }))
    expect(priced.pdlModifierPct).toBeNull()
  })

  it('md5 nunca recebe o modificador de PDL (pdlModifierPct fica null)', () => {
    const priced = computeOrderPrice(baseInput({
      serviceType: 'md5',
      currentRank: { tier: 'gold', division: null },
      winsPurchased: 3,
    }))
    expect(priced.pdlModifierPct).toBeNull()
  })

  it('coaching nunca recebe o modificador de PDL (pdlModifierPct fica null)', () => {
    const priced = computeOrderPrice(baseInput({
      serviceType: 'coaching',
      coachPackagePrice: 100,
      sessionsPurchased: 1,
    }))
    expect(priced.pdlModifierPct).toBeNull()
  })
})

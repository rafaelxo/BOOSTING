import { describe, it, expect } from 'vitest'
import {
  BOOST_CURRENT_RANK_TIERS, STANDARD_RANK_TIERS, PRIORITY_ADDON_CODE,
  BOOST_ADDON_CODES, PDL_BRACKETS, MASTER_PLUS_PROGRESSIONS, NO_DIVISION_TIERS,
  isStandardTier, isMasterPlusCurrentTier, getBoostFlow, tierHasDivisions,
  getValidMasterPlusTargets, isValidMasterPlusProgression,
  getPdlBracket, isAddonCodeValidForFlow, hasDuplicateAddonCodes,
  sortAddonsBySortOrder,
} from './boostDomain'
import { rankStep, type RankTier } from './pricing'

describe('BOOST_CURRENT_RANK_TIERS — origem dos ranks atuais', () => {
  it('não contém Challenger na fonte de opções (não é só filtrado na tela)', () => {
    expect(BOOST_CURRENT_RANK_TIERS).not.toContain('challenger')
  })

  it('contém Iron até Grão-Mestre', () => {
    expect(BOOST_CURRENT_RANK_TIERS).toEqual([
      'iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond', 'master', 'grandmaster',
    ])
  })

  it('STANDARD_RANK_TIERS vai só até Diamond (Duo Boost só existe até lá)', () => {
    expect(STANDARD_RANK_TIERS).toEqual(['iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond'])
    expect(STANDARD_RANK_TIERS).not.toContain('master')
  })
})

describe('getBoostFlow — resolução de fluxo a partir de rank atual + modalidade', () => {
  it('Iron a Diamond + solo => solo_standard', () => {
    for (const tier of STANDARD_RANK_TIERS) {
      expect(getBoostFlow(tier, 'solo')).toBe('solo_standard')
    }
  })

  it('Iron a Diamond + duo => duo_standard', () => {
    for (const tier of STANDARD_RANK_TIERS) {
      expect(getBoostFlow(tier, 'duo')).toBe('duo_standard')
    }
  })

  it('Master/Grão-Mestre + solo => master_plus', () => {
    expect(getBoostFlow('master', 'solo')).toBe('master_plus')
    expect(getBoostFlow('grandmaster', 'solo')).toBe('master_plus')
  })

  it('Master/Grão-Mestre + duo => rejeitado (null), nunca cai em outro fluxo', () => {
    expect(getBoostFlow('master', 'duo')).toBeNull()
    expect(getBoostFlow('grandmaster', 'duo')).toBeNull()
  })

  it('Challenger como rank atual => sempre rejeitado, em qualquer modalidade', () => {
    expect(getBoostFlow('challenger', 'solo')).toBeNull()
    expect(getBoostFlow('challenger', 'duo')).toBeNull()
  })
})

describe('Progressões válidas do Master+', () => {
  it('Master pode ir para Grão-Mestre', () => {
    expect(isValidMasterPlusProgression('master', 'grandmaster')).toBe(true)
  })

  it('Master pode ir direto para Challenger', () => {
    expect(isValidMasterPlusProgression('master', 'challenger')).toBe(true)
  })

  it('Grão-Mestre só pode ir para Challenger', () => {
    expect(isValidMasterPlusProgression('grandmaster', 'challenger')).toBe(true)
    expect(isValidMasterPlusProgression('grandmaster', 'grandmaster')).toBe(false)
    expect(isValidMasterPlusProgression('grandmaster', 'master')).toBe(false)
  })

  it('Challenger nunca é origem válida', () => {
    expect(isValidMasterPlusProgression('challenger', 'grandmaster')).toBe(false)
  })

  it('destino inválido para Master é rejeitado', () => {
    expect(isValidMasterPlusProgression('master', 'master')).toBe(false)
    expect(isValidMasterPlusProgression('master', 'diamond')).toBe(false)
  })

  it('getValidMasterPlusTargets: Master → [Grão-Mestre, Challenger]', () => {
    expect(getValidMasterPlusTargets('master')).toEqual(['grandmaster', 'challenger'])
  })

  it('getValidMasterPlusTargets: Grão-Mestre → [Challenger] (único destino)', () => {
    expect(getValidMasterPlusTargets('grandmaster')).toEqual(['challenger'])
  })

  it('exatamente 3 combinações comerciais existem', () => {
    expect(MASTER_PLUS_PROGRESSIONS).toHaveLength(3)
  })
})

describe('Faixas de PDL — sem sobreposição (seção 14/27)', () => {
  const cases: [number, string][] = [
    [0, '0_49'], [49, '0_49'],
    [50, '50_89'], [89, '50_89'],
    [90, '90_119'], [119, '90_119'],
    [120, '120_plus'], [121, '120_plus'],
  ]

  for (const [pdl, expected] of cases) {
    it(`${pdl} PDL cai em exatamente uma faixa: ${expected}`, () => {
      expect(getPdlBracket(pdl)).toBe(expected)
    })
  }

  it('cobre as 4 faixas sem sobreposição em todo o intervalo 0–200', () => {
    for (let pdl = 0; pdl <= 200; pdl++) {
      const bracket = getPdlBracket(pdl)
      expect(PDL_BRACKETS).toContain(bracket)
    }
  })
})

describe('Addons por fluxo — whitelist estrutural (não é lista completa escondida)', () => {
  it('Solo Boost: solo_only, mono_champ, live_stream, priority — nessa ordem', () => {
    expect(BOOST_ADDON_CODES.solo_standard).toEqual(['solo_only', 'mono_champ', 'live_stream', 'priority'])
  })

  it('Duo Boost: undetectable_duo, explanatory_gameplay, duo_voice, priority — nessa ordem', () => {
    expect(BOOST_ADDON_CODES.duo_standard).toEqual(['undetectable_duo', 'explanatory_gameplay', 'duo_voice', 'priority'])
  })

  it('Master+: explanatory_gameplay, mono_champ, live_stream, priority — nessa ordem', () => {
    expect(BOOST_ADDON_CODES.master_plus).toEqual(['explanatory_gameplay', 'mono_champ', 'live_stream', 'priority'])
  })

  it('Acesso Prioritário (priority) é sempre o último item, nos 3 fluxos', () => {
    for (const flow of ['solo_standard', 'duo_standard', 'master_plus'] as const) {
      const codes = BOOST_ADDON_CODES[flow]
      expect(codes[codes.length - 1]).toBe(PRIORITY_ADDON_CODE)
    }
  })

  it('"Apenas Solo" (solo_only) não existe no Duo nem no Master+', () => {
    expect(isAddonCodeValidForFlow('duo_standard', 'solo_only')).toBe(false)
    expect(isAddonCodeValidForFlow('master_plus', 'solo_only')).toBe(false)
    expect(isAddonCodeValidForFlow('solo_standard', 'solo_only')).toBe(true)
  })

  it('addons de Duo são rejeitados nos outros fluxos', () => {
    for (const code of ['undetectable_duo', 'duo_voice']) {
      expect(isAddonCodeValidForFlow('solo_standard', code)).toBe(false)
      expect(isAddonCodeValidForFlow('master_plus', code)).toBe(false)
    }
  })

  it('mono_champ é compartilhado entre Solo e Master+, mas não existe no Duo', () => {
    expect(isAddonCodeValidForFlow('solo_standard', 'mono_champ')).toBe(true)
    expect(isAddonCodeValidForFlow('master_plus', 'mono_champ')).toBe(true)
    expect(isAddonCodeValidForFlow('duo_standard', 'mono_champ')).toBe(false)
  })

  it('addon inexistente é rejeitado em todos os fluxos', () => {
    for (const flow of ['solo_standard', 'duo_standard', 'master_plus'] as const) {
      expect(isAddonCodeValidForFlow(flow, 'addon_que_nao_existe')).toBe(false)
    }
  })
})

describe('hasDuplicateAddonCodes', () => {
  it('detecta duplicata', () => {
    expect(hasDuplicateAddonCodes(['priority', 'priority'])).toBe(true)
  })
  it('não acusa duplicata quando não há', () => {
    expect(hasDuplicateAddonCodes(['priority', 'mono_champ'])).toBe(false)
  })
})

describe('sortAddonsBySortOrder', () => {
  it('ordena por sort_order, não pela ordem de entrada', () => {
    const input = [
      { code: 'priority', sort_order: 4 },
      { code: 'solo_only', sort_order: 1 },
      { code: 'live_stream', sort_order: 3 },
      { code: 'mono_champ', sort_order: 2 },
    ]
    const sorted = sortAddonsBySortOrder(input)
    expect(sorted.map(a => a.code)).toEqual(['solo_only', 'mono_champ', 'live_stream', 'priority'])
  })

  it('não modifica o array original', () => {
    const input = [{ code: 'b', sort_order: 2 }, { code: 'a', sort_order: 1 }]
    const sorted = sortAddonsBySortOrder(input)
    expect(sorted).not.toBe(input)
    expect(input[0].code).toBe('b')
  })
})

describe('isStandardTier / isMasterPlusCurrentTier', () => {
  it('challenger não é standard nem master+ current (não é rank atual válido)', () => {
    const tier: RankTier = 'challenger'
    expect(isStandardTier(tier)).toBe(false)
    expect(isMasterPlusCurrentTier(tier)).toBe(false)
  })
})

describe('Rank alvo do fluxo padrão pode ultrapassar Diamond (ex.: Diamond → Master)', () => {
  it('Master, Grão-Mestre e Challenger não têm divisão', () => {
    expect(NO_DIVISION_TIERS).toEqual(['master', 'grandmaster', 'challenger'])
    expect(tierHasDivisions('diamond')).toBe(true)
    expect(tierHasDivisions('master')).toBe(false)
    expect(tierHasDivisions('grandmaster')).toBe(false)
    expect(tierHasDivisions('challenger')).toBe(false)
  })

  it('rankStep trata Diamond I → Master/Grão-Mestre/Challenger como progressão válida (passo maior)', () => {
    const diamondI = rankStep('diamond', 'I')
    expect(rankStep('master', null)).toBeGreaterThan(diamondI)
    expect(rankStep('grandmaster', null)).toBeGreaterThan(diamondI)
    expect(rankStep('challenger', null)).toBeGreaterThan(diamondI)
  })

  it('um rank atual Iron/Bronze/etc também pode mirar Master+ (passo bem maior)', () => {
    const ironIV = rankStep('iron', 'IV')
    expect(rankStep('challenger', null)).toBeGreaterThan(ironIV)
  })
})

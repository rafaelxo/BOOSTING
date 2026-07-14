import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOrderBuilderStore } from '@/stores/orderBuilderStore'
import { FormField } from '@/components/ui/FormField'
import { RankBadge } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { cn, RANK_TIER_LABEL, RANK_TIER_ORDER, RANK_TIER_COLOR } from '@/lib/utils'
import { calcEloPrice, getWinBoostPrice, getMd5WinPrice, PLACEMENT_PRICE, DUO_BOOST_PCT, applyLpModifier } from '@/lib/pricing'
import {
  BOOST_CURRENT_RANK_TIERS,
  isMasterPlusCurrentTier, getValidMasterPlusTargets, getPdlBracket, tierHasDivisions,
} from '@/lib/boostDomain'
import type { Division, QueueType, RankTier } from '@/types'
import { Shield, Star, Gem, Diamond, Crown, Flame, Check, Search, AlertCircle } from 'lucide-react'
import { CoachPackagePicker } from './CoachPackagePicker'

const DIVISIONS: Division[] = ['IV', 'III', 'II', 'I']

const TIER_IMAGE: Record<RankTier, string> = {
  iron:        '/ranks/1_iron.webp',
  bronze:      '/ranks/2_bronze.webp',
  silver:      '/ranks/3_silver.webp',
  gold:        '/ranks/4_gold.webp',
  platinum:    '/ranks/5_platinum.webp',
  emerald:     '/ranks/7_emerald.webp',
  diamond:     '/ranks/6_diamond.webp',
  master:      '/ranks/7_master.webp',
  grandmaster: '/ranks/8_grandmaster.webp',
  challenger:  '/ranks/9_challenger.webp',
}

const TIER_FALLBACK: Record<RankTier, React.ElementType> = {
  iron: Shield, bronze: Shield, silver: Star, gold: Star, platinum: Gem,
  emerald: Gem, diamond: Diamond, master: Crown, grandmaster: Flame, challenger: Flame,
}

function divStep(d: Division): number {
  return { IV: 0, III: 1, II: 2, I: 3 }[d]
}

// ── RankCardButton ────────────────────────────────────────────────────────────

function RankCardButton({
  tier, isSelected, isAvailable, onClick,
}: {
  tier: RankTier; isSelected: boolean; isAvailable: boolean; onClick: () => void
}) {
  const [imgErr, setImgErr] = useState(false)
  const FallbackIcon = TIER_FALLBACK[tier]
  const color = RANK_TIER_COLOR[tier]

  return (
    <button
      type="button"
      disabled={!isAvailable}
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-xl border-2 transition-all focus:outline-none',
        isSelected
          ? 'border-brand bg-brand/10'
          : isAvailable
            ? 'border-bg-elevated bg-bg-card hover:border-brand/30 hover:bg-bg-elevated/40'
            : 'border-transparent bg-transparent opacity-20 cursor-not-allowed',
      )}
    >
      {!imgErr ? (
        <img
          src={TIER_IMAGE[tier]}
          alt={RANK_TIER_LABEL[tier]}
          onError={() => setImgErr(true)}
          className="w-8 h-8 object-contain"
          draggable={false}
        />
      ) : (
        <FallbackIcon className={cn('w-7 h-7', color)} />
      )}
      <span className={cn(
        'text-[8px] font-semibold text-center leading-none',
        isSelected ? 'text-brand' : 'text-ink-secondary',
      )}>
        {RANK_TIER_LABEL[tier]}
      </span>
    </button>
  )
}

// ── RankPicker ────────────────────────────────────────────────────────────────
// `tiers` é a fonte de opções JÁ filtrada por quem chama — nunca a lista
// completa de 10 tiers escondendo os inválidos. Ex.: rank atual de
// elo_boost passa BOOST_CURRENT_RANK_TIERS (sem Challenger); rank alvo do
// fluxo padrão passa STANDARD_RANK_TIERS (Iron–Diamond).

interface RankPickerProps {
  tiers: RankTier[]
  selectedTier: RankTier | null
  selectedDivision: Division | null
  onChange: (tier: RankTier, division: Division | null) => void
  minTier?: RankTier | null
  minDiv?: Division | null
}

function RankPicker({
  tiers, selectedTier, selectedDivision, onChange, minTier, minDiv,
}: RankPickerProps) {
  const minIdx = minTier ? tiers.indexOf(minTier) : 0
  const availableSet = new Set(minIdx >= 0 ? tiers.slice(minIdx) : tiers)

  const validDivisions = selectedTier && tierHasDivisions(selectedTier)
    ? DIVISIONS.filter(d => {
        if (!minTier || selectedTier !== minTier) return true
        return divStep(d) > divStep(minDiv ?? 'IV')
      })
    : []

  function handleTier(tier: RankTier) {
    if (!availableSet.has(tier)) return
    // Master/Grão-Mestre/Challenger não têm divisão — seja como rank atual,
    // seja como rank alvo (ex.: Diamond mirando Master pelo fluxo padrão).
    if (!tierHasDivisions(tier)) { onChange(tier, null); return }
    const div = selectedDivision ?? 'IV'
    if (minTier && tier === minTier && minDiv) {
      const first = DIVISIONS.find(d => divStep(d) > divStep(minDiv))
      onChange(tier, first ?? 'I')
      return
    }
    onChange(tier, div)
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-1">
        {tiers.map(tier => (
          <RankCardButton
            key={tier}
            tier={tier}
            isSelected={selectedTier === tier}
            isAvailable={availableSet.has(tier)}
            onClick={() => handleTier(tier)}
          />
        ))}
      </div>
      {selectedTier && validDivisions.length > 0 && (
        <div className="flex gap-1.5">
          {validDivisions.map(div => (
            <button
              key={div}
              type="button"
              onClick={() => onChange(selectedTier, div)}
              className={cn(
                'flex-1 py-1.5 rounded-lg text-xs font-bold border-2 transition-all',
                selectedDivision === div
                  ? 'border-brand bg-brand text-white'
                  : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30',
              )}
            >
              {div}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── LpCounter ─────────────────────────────────────────────────────────────────

function LpCounter({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-ink-secondary">{label}</p>
      <div className="flex items-center rounded-lg border border-bg-elevated bg-bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="px-2 py-1.5 text-sm font-bold text-ink-secondary hover:text-ink hover:bg-bg-elevated transition-all"
        >
          −
        </button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={e => {
            const v = parseInt(e.target.value)
            if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)))
          }}
          className="flex-1 text-center py-1.5 border-x border-bg-elevated bg-transparent text-xs font-extrabold text-ink focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="px-2 py-1.5 text-sm font-bold text-ink-secondary hover:text-ink hover:bg-bg-elevated transition-all"
        >
          +
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function StepConfigure() {
  const {
    serviceType, currentRank, targetRank, queueType, boostMode,
    winsPurchased,
    isMd5, md5MatchesRemaining,
    currentLp, avgLpGain,
    currentPdl, avgPdlGain,
    riotId,
    setCurrentRank, setTargetRank, setQueueType, setBoostMode,
    setWinsPurchased,
    setIsMd5, setMd5MatchesRemaining, setMd5MatchesRemainingFromApi,
    setCurrentLp, setAvgLpGain,
    setCurrentPdl, setAvgPdlGain,
    setBasePrice, setEstimatedHours, setRiotId,
  } = useOrderBuilderStore()

  const currentIsMasterPlus = currentRank ? isMasterPlusCurrentTier(currentRank.tier) : false
  const pdlBracket = currentIsMasterPlus ? getPdlBracket(currentPdl) : null
  const [riotLookupLoading, setRiotLookupLoading] = useState(false)
  const [riotLookupMessage, setRiotLookupMessage] = useState<string | null>(null)
  const [riotLookupError, setRiotLookupError] = useState<string | null>(null)
  const [md5Message, setMd5Message] = useState<string | null>(null)

  async function lookupRiotRank() {
    const trimmed = riotId.trim()
    setRiotLookupMessage(null)
    setRiotLookupError(null)
    setMd5Message(null)

    setRiotLookupLoading(true)
    const { data, error } = await supabase.functions.invoke('riot-account-rank', {
      body: { riot_id: trimmed },
    })
    setRiotLookupLoading(false)

    if (error) {
      setRiotLookupError(error.message || 'Não foi possível consultar a Riot agora.')
      return
    }

    const result = data as {
      found?: boolean
      ranked?: boolean
      tier?: RankTier
      division?: Division | null
      league_points?: number
      avg_lp_gain?: number | null
      avg_lp_loss?: number | null
      message?: string
    } | null

    if (!result?.found) {
      setRiotLookupError('Conta Riot não encontrada.')
      return
    }
    if (!result.ranked || !result.tier) {
      setRiotLookupError('Conta encontrada, mas sem rank Solo/Duo atual.')
      return
    }

    setCurrentRank({ tier: result.tier, division: result.division ?? null })
    if (isMasterPlusCurrentTier(result.tier)) {
      setCurrentPdl(Math.max(0, Math.min(9999, result.league_points ?? 0)))
      if (typeof result.avg_lp_gain === 'number') setAvgPdlGain(Math.max(1, Math.min(200, result.avg_lp_gain)))
    } else {
      setCurrentLp(Math.max(0, Math.min(99, result.league_points ?? 0)))
      if (typeof result.avg_lp_gain === 'number') setAvgLpGain(Math.max(1, Math.min(50, result.avg_lp_gain)))
    }

    setRiotLookupMessage(result.message ?? 'Rank atual preenchido automaticamente. Você ainda pode alterar os dados.')
  }

  async function lookupForWinBoost() {
    const trimmed = riotId.trim()
    setRiotLookupMessage(null)
    setRiotLookupError(null)
    setMd5Message(null)

    setRiotLookupLoading(true)
    const { data, error } = await supabase.functions.invoke('riot-account-rank', {
      body: { riot_id: trimmed, queue: queueType },
    })
    setRiotLookupLoading(false)

    if (error) {
      setRiotLookupError(error.message || 'Não foi possível consultar a Riot agora.')
      return
    }

    const result = data as {
      found?: boolean
      ranked?: boolean
      md5_eligible?: boolean
      matches_remaining?: number
      message?: string
    } | null

    if (!result?.found) {
      setRiotLookupError('Conta Riot não encontrada.')
      return
    }

    if (result.md5_eligible) {
      const remaining = result.matches_remaining ?? 5
      setIsMd5(true)
      setMd5MatchesRemainingFromApi(remaining)
      setWinsPurchased(winsPurchased ?? 1)
      setMd5Message(
        `Conta ainda não rankeada nesta fila - MD5 ativado automaticamente. `
        + `Faltam ${remaining} partida(s) de posicionamento.`,
      )
    } else {
      setMd5MatchesRemainingFromApi(0)
      setIsMd5(false)
      setRiotLookupMessage(result.message ?? 'Conta já possui rank nesta fila - MD5 indisponível.')
    }
  }

  // Grão-Mestre só tem um destino válido (Challenger) — a interface pode
  // preenchê-lo automaticamente, mas o backend valida a combinação de novo.
  useEffect(() => {
    if (currentRank?.tier === 'grandmaster' && targetRank?.tier !== 'challenger') {
      setTargetRank({ tier: 'challenger', division: null })
    }
  }, [currentRank, targetRank, setTargetRank])

  // Preço do Master+ vem da tabela comercial (origem × destino × faixa de
  // PDL atual) — não existe fórmula local. Se a combinação ainda não tem
  // preço configurado, o preço fica indefinido e o pedido não avança.
  const { data: masterPlusPriceRow, isFetching: loadingMasterPlusPrice } = useQuery({
    queryKey: ['master-plus-price', currentRank?.tier, targetRank?.tier, pdlBracket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_plus_pricing')
        .select('price')
        .eq('current_tier', currentRank!.tier)
        .eq('target_tier', targetRank!.tier)
        .eq('pdl_bracket', pdlBracket!)
        .maybeSingle()
      if (error) throw error
      return data as { price: number | null } | null
    },
    enabled: currentIsMasterPlus && !!currentRank && !!targetRank && !!pdlBracket,
  })

  useEffect(() => {
    if (serviceType === 'elo_boost') {
      if (!currentRank) return

      if (currentIsMasterPlus) {
        const price = masterPlusPriceRow?.price
        if (!targetRank || price == null) {
          setBasePrice(0)
          setEstimatedHours(null)
          return
        }
        setBasePrice(price)
        setEstimatedHours(null)
        return
      }

      if (!targetRank) return
      const { price, hours } = calcEloPrice(
        currentRank.tier, currentRank.division ?? null,
        targetRank.tier, targetRank.division ?? null,
      )
      const withLp = applyLpModifier(price, currentRank.tier, currentLp, avgLpGain)
      const finalPrice = boostMode === 'duo'
        ? Math.round(withLp * (1 + DUO_BOOST_PCT / 100) * 100) / 100
        : withLp
      setBasePrice(finalPrice)
      setEstimatedHours(hours || null)

    } else if (serviceType === 'placement_matches') {
      if (!currentRank) return
      setBasePrice(PLACEMENT_PRICE[currentRank.tier] ?? 15)
      setEstimatedHours(3)
    } else if (serviceType === 'win_boost') {
      if (!winsPurchased || !currentRank) return
      const pricePerWin = getWinBoostPrice(currentRank.tier, currentRank.division ?? null)
      setBasePrice(Math.round(winsPurchased * pricePerWin * 100) / 100)
      setEstimatedHours(Math.max(1, Math.round(winsPurchased * 0.4)))
    } else if (serviceType === 'md5') {
      if (!winsPurchased || !currentRank) return
      const cappedWins = Math.min(5, winsPurchased)
      const pricePerWin = getMd5WinPrice(currentRank.tier)
      setBasePrice(Math.round(cappedWins * pricePerWin * 100) / 100)
      setEstimatedHours(Math.max(1, Math.round(cappedWins * 0.4)))
    }
    // coaching: preço vem do pacote escolhido em CoachPackagePicker
    // (setBasePrice chamado lá), não recalculado aqui.
  }, [
    serviceType, currentRank, targetRank, boostMode, winsPurchased,
    currentLp, avgLpGain, currentIsMasterPlus, masterPlusPriceRow,
    setBasePrice, setEstimatedHours,
  ])

  const masterPlusTargets = currentRank && currentIsMasterPlus
    ? getValidMasterPlusTargets(currentRank.tier as 'master' | 'grandmaster')
    : []

  return (
    <div>
      <h2 className="text-lg font-bold text-ink mb-1">Configurar Pedido</h2>
      <p className="text-sm text-ink-secondary mb-6">Defina seus ranks e preferências.</p>

      <div className="space-y-6">
        {/* Riot ID first: used to prefill current rank/LP from Riot. The user
            may still edit everything afterwards; backend validation remains
            authoritative when creating/completing orders. */}
        {serviceType === 'elo_boost' && (
          <FormField label="Riot ID" required hint="Informe antes de configurar. Ex: NomeDoInvocador#BR1. Vamos tentar preencher seu elo atual automaticamente.">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={riotId}
                onChange={e => {
                  setRiotId(e.target.value)
                  setRiotLookupMessage(null)
                  setRiotLookupError(null)
                  setMd5Message(null)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void lookupRiotRank()
                  }
                }}
                placeholder="NomeDoInvocador#TAG"
                className="input-base flex-1"
                maxLength={32}
              />
              <button
                type="button"
                onClick={() => void lookupRiotRank()}
                disabled={riotLookupLoading}
                className={cn(
                  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all',
                  'bg-brand text-white hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed',
                )}
              >
                <Search className="h-4 w-4" />
                {riotLookupLoading ? 'Consultando...' : 'Verificar elo'}
              </button>
            </div>
            {riotLookupMessage && (
              <p className="mt-2 text-xs text-success">{riotLookupMessage}</p>
            )}
            {riotLookupError && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-warning">
                <AlertCircle className="h-3.5 w-3.5" />
                {riotLookupError}
              </p>
            )}
          </FormField>
        )}

        {/* Duo Boost toggle — não existe no fluxo Master+ */}
        {serviceType === 'elo_boost' && !currentIsMasterPlus && (
          <FormField label="Extras" hint="Duo Boost: você joga junto ao booster na duo queue (+50% no preço).">
            <button
              type="button"
              onClick={() => setBoostMode(boostMode === 'duo' ? 'solo' : 'duo')}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left',
                boostMode === 'duo'
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30 hover:text-ink',
              )}
            >
              <div>
                <p className="text-sm font-bold">Duo Boost <span className="text-xs font-normal opacity-70">(+50%)</span></p>
                <p className="text-[11px] font-normal mt-0.5 opacity-70">Você joga junto com o booster na duo queue</p>
              </div>
              <div className={cn(
                'h-5 w-5 rounded border-2 flex items-center justify-center shrink-0',
                boostMode === 'duo' ? 'border-brand bg-brand' : 'border-bg-overlay',
              )}>
                {boostMode === 'duo' && <Check className="h-3 w-3 text-white" />}
              </div>
            </button>
          </FormField>
        )}

        {/* Queue type */}
        {(serviceType === 'elo_boost' || serviceType === 'win_boost' || serviceType === 'md5') && (
          <FormField label="Tipo de Fila" required>
            <div className="flex gap-3">
              {(['solo_duo', 'flex'] as QueueType[]).map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQueueType(q)}
                  className={cn(
                    'flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all',
                    queueType === q
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30',
                  )}
                >
                  {q === 'solo_duo' ? 'Solo/Duo' : 'Flex'}
                </button>
              ))}
            </div>
          </FormField>
        )}

        {(serviceType === 'win_boost' || serviceType === 'md5') && (
          <FormField label="Riot ID" required hint="Informe seu Nome#TAG. Usamos isso para checar automaticamente se sua conta já tem rank nesta fila (MD5).">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={riotId}
                onChange={e => {
                  setRiotId(e.target.value)
                  setRiotLookupMessage(null)
                  setRiotLookupError(null)
                  setMd5Message(null)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void lookupForWinBoost()
                  }
                }}
                placeholder="NomeDoInvocador#TAG"
                className="input-base flex-1"
                maxLength={32}
              />
              <button
                type="button"
                onClick={() => void lookupForWinBoost()}
                disabled={riotLookupLoading}
                className={cn(
                  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all',
                  'bg-brand text-white hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed',
                )}
              >
                <Search className="h-4 w-4" />
                {riotLookupLoading ? 'Consultando...' : 'Verificar elo'}
              </button>
            </div>
            {md5Message && <p className="mt-2 text-xs text-success">{md5Message}</p>}
            {riotLookupMessage && !md5Message && <p className="mt-2 text-xs text-ink-secondary">{riotLookupMessage}</p>}
            {riotLookupError && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-warning">
                <AlertCircle className="h-3.5 w-3.5" />
                {riotLookupError}
              </p>
            )}
          </FormField>
        )}

        {/* Rank selection — elo boost (split two-column layout) */}
        {serviceType === 'elo_boost' && (
          <div className="rounded-2xl border border-bg-elevated overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2">
              {/* ── Current rank column ── */}
              <div className="p-4 space-y-4 border-b border-bg-elevated md:border-b-0 md:border-r">
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Rank Atual</p>

                <RankPicker
                  tiers={BOOST_CURRENT_RANK_TIERS}
                  selectedTier={currentRank?.tier ?? null}
                  selectedDivision={currentRank?.division ?? null}
                  onChange={(tier, division) => setCurrentRank({ tier, division })}
                />

                {/* PDL Atual — mesmo layout (grid de 3 contadores) para os
                    dois fluxos, só trocando quais campos do estado ficam
                    ligados a cada contador. Master+ não tem PDL alvo — o
                    preço depende da faixa do PDL atual, não de um alvo
                    informado pelo cliente. */}
                {currentRank && (
                  <div className="rounded-xl border border-bg-elevated bg-bg-elevated/20 p-3 space-y-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-ink-muted">PDL Atual</p>
                    <div className="grid grid-cols-3 gap-2">
                      {currentIsMasterPlus ? (
                        <>
                          <LpCounter label="PDL Atual" value={currentPdl} min={0} max={9999} onChange={setCurrentPdl} />
                          <LpCounter label="Média/Partida" value={avgPdlGain} min={1} max={200} onChange={setAvgPdlGain} />
                        </>
                      ) : (
                        <>
                          <LpCounter label="LP Atual" value={currentLp} min={0} max={99} onChange={setCurrentLp} />
                          <LpCounter label="Média/Partida" value={avgLpGain} min={1} max={50} onChange={setAvgLpGain} />
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Target rank column ── */}
              <div className="p-4 space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Rank Alvo</p>

                {!currentRank ? (
                  <p className="text-xs text-ink-muted pt-2">Selecione o rank atual primeiro.</p>
                ) : currentIsMasterPlus ? (
                  <div className="space-y-2">
                    {masterPlusTargets.map(tier => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setTargetRank({ tier, division: null })}
                        disabled={currentRank.tier === 'grandmaster'}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left',
                          targetRank?.tier === tier
                            ? 'border-brand bg-brand/10 text-brand'
                            : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30',
                          currentRank.tier === 'grandmaster' && 'cursor-default',
                        )}
                      >
                        <RankBadge tier={tier} size="xs" showLabel={false} />
                        <span className="text-sm font-bold">{RANK_TIER_LABEL[tier]}</span>
                      </button>
                    ))}
                    {currentRank.tier === 'grandmaster' && (
                      <p className="text-[11px] text-ink-muted">Único destino possível a partir de Grão-Mestre.</p>
                    )}
                    {loadingMasterPlusPrice && <p className="text-[11px] text-ink-muted">Calculando preço…</p>}
                    {!loadingMasterPlusPrice && targetRank && masterPlusPriceRow?.price == null && (
                      <p className="text-[11px] text-warning">Preço ainda não configurado para essa combinação. Fale com o suporte.</p>
                    )}
                  </div>
                ) : (
                  // Rank alvo do fluxo padrão pode ir além de Diamond — até
                  // Master/Grão-Mestre/Challenger — usando a mesma progressão
                  // por degrau (o preço de cada degrau acima de Diamond segue
                  // a taxa de Diamante). O fluxo Master+ propriamente dito só
                  // se aplica quando o rank ATUAL já é Master/Grão-Mestre.
                  <RankPicker
                    tiers={RANK_TIER_ORDER}
                    selectedTier={targetRank?.tier ?? null}
                    selectedDivision={targetRank?.division ?? null}
                    onChange={(tier, division) => setTargetRank({ tier, division })}
                    minTier={currentRank.tier}
                    minDiv={currentRank.division}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Rank — win boost / MD5 */}
        {(serviceType === 'win_boost' || serviceType === 'md5') && (
          <>
            <FormField
              label={isMd5 ? 'Rank da Última Temporada' : 'Rank Atual'}
              required
              hint={isMd5 ? 'Sem LP - apenas o rank final da temporada passada.' : undefined}
            >
              <RankPicker
                tiers={RANK_TIER_ORDER}
                selectedTier={currentRank?.tier ?? null}
                selectedDivision={currentRank?.division ?? null}
                onChange={(tier, division) => setCurrentRank({ tier, division })}
              />
            </FormField>

            <FormField label="Extras" hint="MD5: garantimos 80%+ de win rate nas suas partidas de posicionamento restantes, com desconto no preço por vitória.">
              <button
                type="button"
                onClick={() => setIsMd5(!isMd5)}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left',
                  isMd5
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30 hover:text-ink',
                )}
              >
                <div>
                  <p className="text-sm font-bold">MD5 <span className="text-xs font-normal opacity-70">(garantia de win rate)</span></p>
                  <p className="text-[11px] font-normal mt-0.5 opacity-70">
                    {md5MatchesRemaining == null && 'Disponível só para contas ainda não rankeadas nesta fila'}
                  </p>
                </div>
                <div className={cn(
                  'h-5 w-5 rounded border-2 flex items-center justify-center shrink-0',
                  isMd5 ? 'border-brand bg-brand' : 'border-bg-overlay',
                )}>
                  {isMd5 && <Check className="h-3 w-3 text-white" />}
                </div>
              </button>
            </FormField>

            {isMd5 && md5MatchesRemaining != null && (
              <FormField label="Partidas Restantes para o Booster" hint="Detectado automaticamente pela Riot. Você pode diminuir se já jogou mais partidas depois da checagem, mas não aumentar.">
                <div className="flex items-center gap-0 rounded-xl border-2 border-bg-elevated bg-bg-card overflow-hidden w-fit">
                  <button
                    type="button"
                    onClick={() => setMd5MatchesRemaining(md5MatchesRemaining - 1)}
                    disabled={md5MatchesRemaining <= 0}
                    className="px-4 py-3 text-lg font-bold text-ink-secondary hover:text-ink hover:bg-bg-elevated transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    -
                  </button>
                  <div className="px-6 py-3 text-center min-w-[110px] border-x border-bg-elevated">
                    <p className="text-xl font-extrabold text-ink leading-none">{md5MatchesRemaining}</p>
                    <p className="text-[10px] text-ink-muted mt-0.5">partida(s)</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMd5MatchesRemaining(md5MatchesRemaining + 1)}
                    className="px-4 py-3 text-lg font-bold text-ink-secondary hover:text-ink hover:bg-bg-elevated transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    +
                  </button>
                </div>
              </FormField>
            )}
          </>
        )}

        {/* Rank — placement matches */}
        {serviceType === 'placement_matches' && (
          <FormField label="Rank Final da Última Temporada" required>
            <RankPicker
              tiers={RANK_TIER_ORDER}
              selectedTier={currentRank?.tier ?? null}
              selectedDivision={currentRank?.division ?? null}
              onChange={(tier, division) => setCurrentRank({ tier, division })}
            />
          </FormField>
        )}

        {/* Wins counter — win boost / MD5 */}
        {(serviceType === 'win_boost' || serviceType === 'md5') && (
          <FormField label="Número de Vitórias" required>
            <div className="flex items-center gap-0 rounded-xl border-2 border-bg-elevated bg-bg-card overflow-hidden w-fit">
              <button
                type="button"
                onClick={() => setWinsPurchased(Math.max(1, (winsPurchased ?? 1) - 1))}
                className="px-4 py-3 text-lg font-bold text-ink-secondary hover:text-ink hover:bg-bg-elevated transition-all"
              >
                −
              </button>
              <div className="px-6 py-3 text-center min-w-[110px] border-x border-bg-elevated">
                <p className="text-xl font-extrabold text-ink leading-none">{winsPurchased ?? 1}</p>
                <p className="text-[10px] text-ink-muted mt-0.5">vitórias</p>
              </div>
              <button
                type="button"
                onClick={() => setWinsPurchased((winsPurchased ?? 1) + 1)}
                className="px-4 py-3 text-lg font-bold text-ink-secondary hover:text-ink hover:bg-bg-elevated transition-all"
              >
                +
              </button>
            </div>
            <p className="text-xs text-ink-muted mt-1.5">{isMd5 ? 'Mínimo 1 - Máximo 5' : 'Mínimo 1 - Máximo 50'}</p>
          </FormField>
        )}

        {/* Coaching — escolhe um pacote real de um booster; preço vem do
            pacote, nunca é combinado depois. */}
        {serviceType === 'coaching' && <CoachPackagePicker />}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOrderBuilderStore } from '@/stores/orderBuilderStore'
import { FormField } from '@/components/ui/FormField'
import { RankBadge } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { cn, RANK_TIER_LABEL, RANK_TIER_ORDER, RANK_TIER_COLOR } from '@/lib/utils'
import { calcEloPrice, getWinBoostPrice, PLACEMENT_PRICE, DUO_BOOST_PCT, applyLpModifier } from '@/lib/pricing'
import {
  BOOST_CURRENT_RANK_TIERS,
  isMasterPlusCurrentTier, getValidMasterPlusTargets, getPdlBracket, tierHasDivisions,
} from '@/lib/boostDomain'
import type { Division, QueueType, RankTier } from '@/types'
import { Shield, Star, Gem, Diamond, Crown, Flame, Check } from 'lucide-react'

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
    winsPurchased, sessionsPurchased,
    currentLp, avgLpGain, avgLpLoss,
    currentPdl, avgPdlGain, avgPdlLoss,
    setCurrentRank, setTargetRank, setQueueType, setBoostMode,
    setWinsPurchased,
    setCurrentLp, setAvgLpGain, setAvgLpLoss,
    setCurrentPdl, setAvgPdlGain, setAvgPdlLoss,
    setBasePrice, setEstimatedHours,
  } = useOrderBuilderStore()

  const currentIsMasterPlus = currentRank ? isMasterPlusCurrentTier(currentRank.tier) : false
  const pdlBracket = currentIsMasterPlus ? getPdlBracket(currentPdl) : null

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
      const withLp = applyLpModifier(price, currentRank.tier, currentLp, avgLpGain, avgLpLoss)
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
    } else if (serviceType === 'coaching') {
      setBasePrice(0)
      setEstimatedHours(sessionsPurchased ?? 1)
    }
  }, [
    serviceType, currentRank, targetRank, boostMode, winsPurchased, sessionsPurchased,
    currentLp, avgLpGain, avgLpLoss, currentIsMasterPlus, masterPlusPriceRow,
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
        {(serviceType === 'elo_boost' || serviceType === 'win_boost') && (
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
                          <LpCounter label="Méd. Ganhos" value={avgPdlGain} min={1} max={200} onChange={setAvgPdlGain} />
                          <LpCounter label="Méd. Perdidos" value={avgPdlLoss} min={1} max={200} onChange={setAvgPdlLoss} />
                        </>
                      ) : (
                        <>
                          <LpCounter label="LP Atual" value={currentLp} min={0} max={99} onChange={setCurrentLp} />
                          <LpCounter label="Méd. Ganhos" value={avgLpGain} min={1} max={50} onChange={setAvgLpGain} />
                          <LpCounter label="Méd. Perdidos" value={avgLpLoss} min={1} max={40} onChange={setAvgLpLoss} />
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

        {/* Rank — win boost */}
        {serviceType === 'win_boost' && (
          <FormField label="Rank Atual" required>
            <RankPicker
              tiers={RANK_TIER_ORDER}
              selectedTier={currentRank?.tier ?? null}
              selectedDivision={currentRank?.division ?? null}
              onChange={(tier, division) => setCurrentRank({ tier, division })}
            />
          </FormField>
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

        {/* Wins counter — win boost */}
        {serviceType === 'win_boost' && (
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
                onClick={() => setWinsPurchased(Math.min(50, (winsPurchased ?? 1) + 1))}
                className="px-4 py-3 text-lg font-bold text-ink-secondary hover:text-ink hover:bg-bg-elevated transition-all"
              >
                +
              </button>
            </div>
            <p className="text-xs text-ink-muted mt-1.5">Mínimo 1 · Máximo 50</p>
          </FormField>
        )}

        {/* Coaching */}
        {serviceType === 'coaching' && (
          <div className="rounded-xl border border-bg-elevated bg-bg-elevated/40 p-4 space-y-1.5">
            <p className="text-sm font-semibold text-ink">Coaching por sessão</p>
            <p className="text-xs text-ink-secondary leading-relaxed">
              O valor é combinado diretamente com o booster após a criação do pedido. Nenhum pagamento antecipado é necessário.
            </p>
            <p className="text-sm font-bold text-brand mt-1">Valor a combinar</p>
          </div>
        )}
      </div>
    </div>
  )
}

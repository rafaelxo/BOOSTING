import { useEffect } from 'react'
import { useOrderBuilderStore } from '@/stores/orderBuilderStore'
import { FormField } from '@/components/ui/FormField'
import { RankBadge } from '@/components/ui/RankBadge'
import { cn, RANK_TIER_LABEL, RANK_TIER_ORDER, formatRank } from '@/lib/utils'
import { calcEloPrice, getWinBoostPrice, PLACEMENT_PRICE, COACHING_PRICE, DUO_BOOST_PCT } from '@/lib/pricing'
import type { BoostMode, Division, QueueType, RankTier } from '@/types'

const DIVISIONS: Division[] = ['IV', 'III', 'II', 'I']
const MASTER_PLUS: RankTier[] = ['master', 'grandmaster', 'challenger']

function divStep(d: Division): number {
  return { IV: 0, III: 1, II: 2, I: 3 }[d]
}

interface RankSelectProps {
  label: string
  selectedTier: RankTier | null
  selectedDivision: Division | null
  onChange: (tier: RankTier, division: Division | null) => void
  minTier?: RankTier | null
  minDiv?: Division | null
}

function RankSelect({ label, selectedTier, selectedDivision, onChange, minTier, minDiv }: RankSelectProps) {
  const hasDivision = selectedTier && !MASTER_PLUS.includes(selectedTier)
  const minIdx = minTier ? RANK_TIER_ORDER.indexOf(minTier) : 0
  const availableTiers = RANK_TIER_ORDER.slice(minIdx)

  const validDivisions = hasDivision
    ? DIVISIONS.filter(d => {
        if (!minTier || selectedTier !== minTier) return true
        return divStep(d) > divStep(minDiv ?? 'IV')
      })
    : []

  function handleTier(tier: RankTier) {
    const div = MASTER_PLUS.includes(tier) ? null : (selectedDivision ?? 'IV')
    if (minTier && tier === minTier && minDiv) {
      const first = DIVISIONS.find(d => divStep(d) > divStep(minDiv))
      onChange(tier, first ?? 'I')
      return
    }
    onChange(tier, div)
  }

  return (
    <FormField label={label} required>
      <div className="space-y-3">
        {/* Selected rank preview */}
        {selectedTier && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-bg-elevated/50 border border-bg-overlay">
            <RankBadge tier={selectedTier} division={selectedDivision} size="sm" />
            <p className="text-sm font-bold text-ink">
              {formatRank(selectedTier, selectedDivision)}
            </p>
          </div>
        )}

        {/* Tier grid with rank badges */}
        <div className="grid grid-cols-5 gap-1.5">
          {availableTiers.map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => handleTier(tier)}
              className={cn(
                'rounded-xl ring-2 transition-all focus:outline-none',
                selectedTier === tier ? 'ring-brand' : 'ring-transparent hover:ring-brand/30'
              )}
            >
              <RankBadge tier={tier} showDivision={false} size="xs" />
            </button>
          ))}
        </div>

        {/* Division pills */}
        {hasDivision && validDivisions.length > 0 && (
          <div className="flex gap-1.5">
            {validDivisions.map((div) => (
              <button
                key={div}
                type="button"
                onClick={() => onChange(selectedTier!, div)}
                className={cn(
                  'flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all',
                  selectedDivision === div
                    ? 'border-brand bg-brand text-white'
                    : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30'
                )}
              >
                {div}
              </button>
            ))}
          </div>
        )}
      </div>
    </FormField>
  )
}

export function StepConfigure() {
  const {
    serviceType, currentRank, targetRank, queueType, boostMode,
    winsPurchased, sessionsPurchased,
    setCurrentRank, setTargetRank, setQueueType, setBoostMode,
    setWinsPurchased, setSessionsPurchased,
    setBasePrice, setEstimatedHours,
  } = useOrderBuilderStore()

  useEffect(() => {
    if (serviceType === 'elo_boost') {
      if (!currentRank || !targetRank) return
      const { price, hours } = calcEloPrice(
        currentRank.tier, currentRank.division ?? null,
        targetRank.tier, targetRank.division ?? null,
      )
      const finalPrice = boostMode === 'duo'
        ? Math.round(price * (1 + DUO_BOOST_PCT / 100) * 100) / 100
        : price
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
      if (!sessionsPurchased) return
      setBasePrice(COACHING_PRICE[sessionsPurchased] ?? 19.99)
      setEstimatedHours(sessionsPurchased)
    }
  }, [serviceType, currentRank, targetRank, boostMode, winsPurchased, sessionsPurchased, setBasePrice, setEstimatedHours])

  return (
    <div>
      <h2 className="text-lg font-bold text-ink mb-1">Configurar Pedido</h2>
      <p className="text-sm text-ink-secondary mb-6">Defina seus ranks e preferências.</p>

      <div className="space-y-6">
        {/* Duo Boost checkbox — only for elo boost */}
        {serviceType === 'elo_boost' && (
          <FormField label="Extras" hint="Duo Boost: você joga junto ao booster na duo queue (+52% no preço).">
            <button
              type="button"
              onClick={() => setBoostMode(boostMode === 'duo' ? 'solo' : 'duo')}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left',
                boostMode === 'duo'
                  ? 'border-brand bg-brand-muted text-brand'
                  : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30 hover:text-ink'
              )}
            >
              <div>
                <p className="text-sm font-bold">Duo Boost <span className="text-xs font-normal opacity-70">(+52%)</span></p>
                <p className="text-[11px] font-normal mt-0.5 opacity-70">Você joga junto com o booster na duo queue</p>
              </div>
              <div className={cn(
                'h-5 w-5 rounded border-2 flex items-center justify-center shrink-0',
                boostMode === 'duo' ? 'border-brand bg-brand' : 'border-bg-overlay'
              )}>
                {boostMode === 'duo' && <span className="text-white text-[10px] font-black">✓</span>}
              </div>
            </button>
          </FormField>
        )}

        {/* Queue type */}
        {(serviceType === 'elo_boost' || serviceType === 'win_boost') && (
          <FormField label="Tipo de Fila" required>
            <div className="flex gap-3">
              {([['solo_duo', 'Solo/Duo'], ['flex', 'Flex']] as [QueueType, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setQueueType(value)}
                  className={cn(
                    'flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all',
                    queueType === value
                      ? 'border-brand bg-brand-muted text-brand'
                      : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </FormField>
        )}

        {/* Ranks — elo boost */}
        {serviceType === 'elo_boost' && (
          <>
            <RankSelect
              label="Rank Atual"
              selectedTier={currentRank?.tier ?? null}
              selectedDivision={currentRank?.division ?? null}
              onChange={(tier, division) => setCurrentRank({ tier, division })}
            />
            <RankSelect
              label="Rank Alvo"
              selectedTier={targetRank?.tier ?? null}
              selectedDivision={targetRank?.division ?? null}
              onChange={(tier, division) => setTargetRank({ tier, division })}
              minTier={currentRank?.tier ?? null}
              minDiv={currentRank?.division ?? null}
            />
          </>
        )}

        {/* Rank — placement / win boost */}
        {(serviceType === 'placement_matches' || serviceType === 'win_boost') && (
          <RankSelect
            label="Rank Atual"
            selectedTier={currentRank?.tier ?? null}
            selectedDivision={currentRank?.division ?? null}
            onChange={(tier, division) => setCurrentRank({ tier, division })}
          />
        )}

        {/* Wins — win boost */}
        {serviceType === 'win_boost' && (
          <FormField label="Número de Vitórias" required>
            <div className="flex flex-wrap gap-2">
              {[3, 5, 10, 15, 20, 30, 50].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setWinsPurchased(n)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all',
                    winsPurchased === n
                      ? 'border-brand bg-brand-muted text-brand'
                      : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30'
                  )}
                >
                  {n} vitórias
                </button>
              ))}
            </div>
          </FormField>
        )}

        {/* Sessions — coaching */}
        {serviceType === 'coaching' && (
          <FormField label="Duração da Sessão" required>
            <div className="flex gap-3">
              {([['1h', 1], ['2h', 2]] as [string, number][]).map(([label, val]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setSessionsPurchased(val)}
                  className={cn(
                    'flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all',
                    sessionsPurchased === val
                      ? 'border-brand bg-brand-muted text-brand'
                      : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </FormField>
        )}
      </div>
    </div>
  )
}

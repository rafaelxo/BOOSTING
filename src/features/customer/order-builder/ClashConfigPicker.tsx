// src/features/customer/order-builder/ClashConfigPicker.tsx
import { useEffect } from 'react'
import { Check } from 'lucide-react'
import { useOrderBuilderStore } from '@/stores/orderBuilderStore'
import { cn } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { RankBadge } from '@/components/ui'
import { getClashBasePrice, CLASH_ESTIMATED_HOURS } from '@/lib/pricing'
import {
  CLASH_TIER_LABEL, CLASH_TIER_RANGE_LABEL, CLASH_TIER_BOUNDARY_RANKS, CLASH_DAY_LABEL,
} from '@/lib/clashDomain'
import type { ClashTier, ClashDay, BoostMode } from '@/types'

const CLASH_TIERS: ClashTier[] = ['tier_4', 'tier_3', 'tier_2', 'tier_1']
const CLASH_DAYS: ClashDay[] = ['saturday', 'sunday']
const CLASH_MODES: { mode: BoostMode; title: string; desc: string }[] = [
  { mode: 'solo', title: 'Solo Clash', desc: 'O booster joga na sua conta e monta o time dentro do jogo.' },
  { mode: 'duo', title: 'Duo Clash', desc: 'Você joga junto com o booster, que monta o restante do time.' },
]

export function ClashConfigPicker() {
  const {
    boostMode, setBoostMode, clashTier, setClashTier, clashDay, setClashDay,
    setBasePrice, setEstimatedHours, setPdlModifierPct, stepAttempted,
  } = useOrderBuilderStore()
  const currency = useCurrency()

  useEffect(() => {
    setPdlModifierPct(null)
    if (!clashTier) {
      setBasePrice(0)
      setEstimatedHours(null)
      return
    }
    setBasePrice(getClashBasePrice(boostMode, clashTier))
    setEstimatedHours(CLASH_ESTIMATED_HOURS)
  }, [boostMode, clashTier, setBasePrice, setEstimatedHours, setPdlModifierPct])

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-ink-muted mb-3">Modalidade</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {CLASH_MODES.map(({ mode, title, desc }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setBoostMode(mode)}
              className={cn(
                'relative text-left p-4 rounded-2xl border-2 transition-all duration-150',
                boostMode === mode
                  ? 'border-brand bg-brand/10 shadow-brand'
                  : 'border-bg-elevated bg-bg-card hover:border-brand/40 hover:bg-bg-elevated',
              )}
            >
              <p className={cn('text-sm font-bold', boostMode === mode ? 'text-brand' : 'text-ink')}>{title}</p>
              <p className="text-xs text-ink-secondary mt-1 leading-relaxed">{desc}</p>
              {boostMode === mode && <Check className="absolute top-3 right-3 h-4 w-4 text-brand" />}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-ink-muted mb-3">Tier</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {CLASH_TIERS.map((tier) => {
            const { low, high } = CLASH_TIER_BOUNDARY_RANKS[tier]
            const selected = clashTier === tier
            return (
              <button
                key={tier}
                type="button"
                onClick={() => setClashTier(tier)}
                className={cn(
                  'relative flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all duration-150',
                  selected
                    ? 'border-brand bg-brand/10 shadow-brand'
                    : 'border-bg-elevated bg-bg-card hover:border-brand/40 hover:bg-bg-elevated',
                )}
              >
                <div className="flex items-center shrink-0">
                  <RankBadge tier={low} size="xs" showLabel={false} />
                  {high !== low && <RankBadge tier={high} size="xs" showLabel={false} className="-ml-2" />}
                </div>
                <div className="min-w-0">
                  <p className={cn('text-sm font-bold', selected ? 'text-brand' : 'text-ink')}>{CLASH_TIER_LABEL[tier]}</p>
                  <p className="text-xs text-ink-secondary truncate">{CLASH_TIER_RANGE_LABEL[tier]}</p>
                  <p className={cn('text-xs font-bold mt-0.5', selected ? 'text-brand' : 'text-ink-muted')}>
                    {currency(getClashBasePrice(boostMode, tier))}
                  </p>
                </div>
                {selected && <Check className="absolute top-3 right-3 h-4 w-4 text-brand" />}
              </button>
            )
          })}
        </div>
        {stepAttempted && !clashTier && <p className="text-xs text-danger mt-2">Selecione um tier</p>}
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-ink-muted mb-3">Dia</p>
        <div className="grid grid-cols-2 gap-3">
          {CLASH_DAYS.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => setClashDay(day)}
              className={cn(
                'py-3 rounded-xl text-sm font-bold border-2 transition-all',
                clashDay === day
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30',
              )}
            >
              {CLASH_DAY_LABEL[day]}
            </button>
          ))}
        </div>
        {stepAttempted && !clashDay && <p className="text-xs text-danger mt-2">Selecione um dia</p>}
      </div>

      <div className="rounded-xl border border-bg-elevated bg-bg-elevated/30 p-3 text-xs text-ink-secondary">
        O booster é responsável por organizar e montar o time necessário para a participação no Clash.
      </div>
    </div>
  )
}

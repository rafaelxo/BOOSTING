import { useEffect } from 'react'
import { useOrderBuilderStore } from '@/stores/orderBuilderStore'
import { cn } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { CheckCircle2, Zap, Eye, Radio, Trophy, EyeOff, Tv } from 'lucide-react'
import type { ServiceExtra } from '@/types'

// Static extras (in production these come from DB)
const EXTRAS: ServiceExtra[] = [
  { id: 'priority', service_id: null, name: 'Priority Processing', description: 'Assigned to a top-rated booster immediately. Fastest start.', price_modifier: 0, price_modifier_pct: 15, is_active: true, sort_order: 1, icon: 'zap' },
  { id: 'solo_only', service_id: null, name: 'Solo Queue Only', description: 'Booster only plays in SoloQ. No duo or flex lobbies.', price_modifier: 0, price_modifier_pct: 10, is_active: true, sort_order: 2, icon: 'trophy' },
  { id: 'mono_champ', service_id: null, name: 'Mono Champion', description: 'Your preferred champion every game. Specify in notes.', price_modifier: 0, price_modifier_pct: 5, is_active: true, sort_order: 3, icon: 'eye' },
  { id: 'live_stream', service_id: null, name: 'Live Stream', description: 'Watch your booster play via a private stream link.', price_modifier: 4.99, price_modifier_pct: 0, is_active: true, sort_order: 4, icon: 'tv' },
  { id: 'live_monitoring', service_id: null, name: 'Live Monitoring', description: 'Staff monitors your order and sends updates every few hours.', price_modifier: 2.99, price_modifier_pct: 0, is_active: true, sort_order: 5, icon: 'radio' },
  { id: 'appear_offline', service_id: null, name: 'Appear Offline', description: 'Your account appears offline throughout the service.', price_modifier: 0, price_modifier_pct: 0, is_active: true, sort_order: 6, icon: 'eye-off' },
]

const ICON_MAP: Record<string, React.ElementType> = {
  zap: Zap, eye: Eye, radio: Radio, trophy: Trophy, 'eye-off': EyeOff, tv: Tv,
}

export function StepExtras() {
  const { selectedExtras, toggleExtra, basePrice, setExtrasPrice } = useOrderBuilderStore()
  const currency = useCurrency()
  const selectedIds = new Set(selectedExtras.map(e => e.extra.id))

  // Keep extrasPrice in sync whenever selection or basePrice changes
  useEffect(() => {
    const total = selectedExtras.reduce((sum, { extra }) => {
      if (extra.price_modifier > 0) return sum + extra.price_modifier
      if (extra.price_modifier_pct > 0) return sum + (basePrice * extra.price_modifier_pct) / 100
      return sum
    }, 0)
    setExtrasPrice(Math.round(total * 100) / 100)
  }, [selectedExtras, basePrice, setExtrasPrice])

  function getExtraPrice(extra: ServiceExtra): number {
    if (extra.price_modifier > 0) return extra.price_modifier
    if (extra.price_modifier_pct > 0) return (basePrice * extra.price_modifier_pct) / 100
    return 0
  }

  function formatExtraPrice(extra: ServiceExtra): string {
    if (extra.price_modifier > 0) return `+${currency(extra.price_modifier)}`
    if (extra.price_modifier_pct > 0) return `+${extra.price_modifier_pct}%`
    return 'Free'
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-ink mb-1">Premium Add-ons</h2>
      <p className="text-sm text-ink-secondary mb-6">
        Upgrade your service with optional extras. You can skip this step.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        {EXTRAS.map((extra) => {
          const selected = selectedIds.has(extra.id)
          const Icon = ICON_MAP[extra.icon ?? 'zap'] ?? Zap
          const price = getExtraPrice(extra)

          return (
            <button
              key={extra.id}
              onClick={() => toggleExtra(extra)}
              className={cn(
                'relative flex items-start gap-4 p-4 rounded-2xl border-2 text-left transition-all duration-150',
                selected
                  ? 'border-brand bg-brand-muted shadow-brand'
                  : 'border-bg-elevated bg-bg-card hover:border-brand/40 hover:bg-bg-elevated'
              )}
            >
              {selected && (
                <CheckCircle2 className="absolute top-3 right-3 h-4 w-4 text-brand" />
              )}
              <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center shrink-0', selected ? 'bg-brand text-white' : 'bg-bg-elevated text-ink-secondary')}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0 pr-6">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn('text-sm font-semibold', selected ? 'text-brand' : 'text-ink')}>{extra.name}</p>
                  <span className={cn('text-xs font-bold shrink-0', price === 0 ? 'text-success' : 'text-brand')}>
                    {formatExtraPrice(extra)}
                  </span>
                </div>
                <p className="text-xs text-ink-secondary mt-1 leading-relaxed">{extra.description}</p>
              </div>
            </button>
          )
        })}
      </div>

      {selectedExtras.length > 0 && (
        <p className="mt-4 text-xs text-ink-secondary text-center">
          {selectedExtras.length} add-on{selectedExtras.length > 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  )
}

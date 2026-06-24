import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOrderBuilderStore } from '@/stores/orderBuilderStore'
import { cn } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { CheckCircle2, Zap, Radio, Tv, Users, Crosshair, Star, MapPin, User, Trophy } from 'lucide-react'
import { Skeleton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { getWinBoostPrice } from '@/lib/pricing'
import type { ServiceExtra } from '@/types'

const ICON_MAP: Record<string, React.ElementType> = {
  zap:      Zap,
  tv:       Tv,
  crosshair:Crosshair,
  'map-pin':MapPin,
  user:     User,
  star:     Star,
  radio:    Radio,
  users:    Users,
}

const HIDDEN_NAMES = [
  'offline', 'appear offline', 'aparecer offline',
  'monitoramento', 'live monitoring', 'live monitor',
  'duo boost',
  'lane específica', 'lane especifica',
]

function isHidden(name: string): boolean {
  const lower = name.toLowerCase()
  return HIDDEN_NAMES.some(h => lower.includes(h))
}

const WIN_PACKAGES = [
  { wins: 1, discountPct: 10 },
  { wins: 3, discountPct: 20 },
  { wins: 5, discountPct: 30 },
]

export function StepExtras() {
  const {
    selectedExtras, toggleExtra, basePrice, setExtrasPrice,
    serviceType, currentRank, winPackage, setWinPackage,
  } = useOrderBuilderStore()
  const currency = useCurrency()
  const selectedIds = new Set(selectedExtras.map(e => e.extra.id))

  const showWinPackages = currentRank && serviceType === 'elo_boost'

  const unitWinPrice = showWinPackages
    ? getWinBoostPrice(currentRank.tier, currentRank.division ?? null)
    : 0

  function packageTotal(wins: number, discountPct: number): number {
    return Math.round(unitWinPrice * wins * (1 - discountPct / 100) * 100) / 100
  }

  const { data: allExtras = [], isLoading } = useQuery({
    queryKey: ['service-extras'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_extras')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data as ServiceExtra[]
    },
    staleTime: 1000 * 60 * 10,
  })

  const extras = allExtras.filter(e => !isHidden(e.name))

  useEffect(() => {
    let total = selectedExtras.reduce((sum, { extra }) => {
      if (extra.price_modifier > 0) return sum + extra.price_modifier
      if (extra.price_modifier_pct > 0) return sum + (basePrice * extra.price_modifier_pct) / 100
      return sum
    }, 0)

    if (winPackage && currentRank) {
      const pkg = WIN_PACKAGES.find(p => p.wins === winPackage)
      if (pkg) total += packageTotal(pkg.wins, pkg.discountPct)
    }

    setExtrasPrice(Math.round(total * 100) / 100)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExtras, basePrice, winPackage, currentRank, setExtrasPrice])

  function getExtraPrice(extra: ServiceExtra): number {
    if (extra.price_modifier > 0) return extra.price_modifier
    if (extra.price_modifier_pct > 0) return (basePrice * extra.price_modifier_pct) / 100
    return 0
  }

  function formatExtraPrice(extra: ServiceExtra): string {
    if (extra.price_modifier > 0) return `+${currency(extra.price_modifier)}`
    if (extra.price_modifier_pct > 0) return `+${extra.price_modifier_pct}%`
    return 'Grátis'
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-ink mb-1">Extras</h2>
      <p className="text-sm text-ink-secondary mb-6">
        Personalize seu pedido com extras opcionais. Você pode pular esta etapa.
      </p>

      <div className="space-y-6">
        {/* Regular extras */}
        {isLoading ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : extras.length === 0 ? (
          <p className="text-sm text-ink-muted text-center py-8">Nenhum extra disponível no momento.</p>
        ) : (
          <div>
            {showWinPackages && (
              <p className="text-xs font-bold uppercase tracking-widest text-ink-muted mb-3">Opções Adicionais</p>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              {extras.map((extra) => {
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
                        ? 'border-brand bg-brand/10 shadow-brand'
                        : 'border-bg-elevated bg-bg-card hover:border-brand/40 hover:bg-bg-elevated',
                    )}
                  >
                    {selected && (
                      <CheckCircle2 className="absolute top-3 right-3 h-4 w-4 text-brand" />
                    )}
                    <div className={cn(
                      'h-9 w-9 rounded-xl flex items-center justify-center shrink-0',
                      selected ? 'bg-brand text-white' : 'bg-bg-elevated text-ink-secondary',
                    )}>
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
          </div>
        )}

        {/* Win packages — only for elo_boost with rank selected */}
        {showWinPackages && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-ink-muted mb-3">Pacotes de Vitórias</p>
            <div className="grid grid-cols-3 gap-3">
              {WIN_PACKAGES.map(({ wins, discountPct }) => {
                const total = packageTotal(wins, discountPct)
                const original = Math.round(unitWinPrice * wins * 100) / 100
                const savings = Math.round((original - total) * 100) / 100
                const isSelected = winPackage === wins

                return (
                  <button
                    key={wins}
                    type="button"
                    onClick={() => setWinPackage(isSelected ? null : wins)}
                    className={cn(
                      'relative flex flex-col items-center gap-2 p-4 rounded-2xl border-2 text-center transition-all duration-150',
                      isSelected
                        ? 'border-brand bg-brand/10'
                        : 'border-bg-elevated bg-bg-card hover:border-brand/40 hover:bg-bg-elevated',
                    )}
                  >
                    {isSelected && (
                      <CheckCircle2 className="absolute top-2.5 right-2.5 h-4 w-4 text-brand" />
                    )}

                    {/* Discount badge */}
                    <span className={cn(
                      'text-[10px] font-black px-2 py-0.5 rounded-full',
                      isSelected ? 'bg-brand text-white' : 'bg-bg-elevated text-ink-secondary',
                    )}>
                      -{discountPct}%
                    </span>

                    {/* Trophy + wins */}
                    <div className="flex items-center gap-1.5">
                      <Trophy className={cn('h-4 w-4 shrink-0', isSelected ? 'text-brand' : 'text-ink-muted')} />
                      <span className={cn('text-xl font-extrabold leading-none', isSelected ? 'text-brand' : 'text-ink')}>
                        {wins}
                      </span>
                      <span className={cn('text-[11px] font-semibold', isSelected ? 'text-brand/80' : 'text-ink-secondary')}>
                        {wins === 1 ? 'vitória' : 'vitórias'}
                      </span>
                    </div>

                    {/* Total price */}
                    <p className={cn('text-base font-extrabold', isSelected ? 'text-brand' : 'text-ink')}>
                      {currency(total)}
                    </p>

                    {/* Unit price reference */}
                    <p className="text-[10px] text-ink-muted leading-tight">
                      {currency(unitWinPrice)}/vitória
                    </p>

                    {/* Savings */}
                    <span className="text-[10px] font-semibold text-success">
                      economia {currency(savings)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Clock, DollarSign, CheckCircle2, Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { useOrderBuilderStore } from '@/stores/orderBuilderStore'
import { LANES, LANE_LABEL, COACH_SPECIALTIES, SPECIALTY_LABEL } from '@/lib/lolTaxonomy'
import type { BoosterService } from '@/types'

interface CoachBoosterInfo {
  user_id: string
  display_name: string
  rating: number | null
  is_top5: boolean | null
}

export function CoachPackagePicker() {
  const currency = useCurrency()
  const { selectedCoachPackage, setSelectedCoachPackage, setPreferredBooster, setBasePrice } = useOrderBuilderStore()
  const [search, setSearch] = useState('')
  const [laneFilter, setLaneFilter] = useState<string | null>(null)
  const [specialtyFilter, setSpecialtyFilter] = useState<string | null>(null)

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ['coach-packages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booster_services')
        .select('*')
        .eq('service_type', 'coaching')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as BoosterService[]
    },
  })

  const boosterIds = useMemo(() => [...new Set(packages.map(p => p.booster_id))], [packages])

  const { data: boosters = [] } = useQuery({
    queryKey: ['coach-packages-boosters', boosterIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_booster_profiles')
        .select('user_id, display_name, rating, is_top5')
        .in('user_id', boosterIds)
      if (error) throw error
      return data as unknown as CoachBoosterInfo[]
    },
    enabled: boosterIds.length > 0,
  })

  const boosterMap = useMemo(
    () => Object.fromEntries(boosters.map(b => [b.user_id, b])),
    [boosters],
  )

  const filtered = packages.filter(p => {
    const boosterName = boosterMap[p.booster_id]?.display_name ?? ''
    if (search) {
      const q = search.toLowerCase()
      const matches = p.title.toLowerCase().includes(q)
        || (p.description ?? '').toLowerCase().includes(q)
        || boosterName.toLowerCase().includes(q)
      if (!matches) return false
    }
    if (laneFilter && !p.lanes?.includes(laneFilter)) return false
    if (specialtyFilter && !p.specialties?.includes(specialtyFilter)) return false
    return true
  })

  function selectPackage(p: BoosterService) {
    const boosterName = boosterMap[p.booster_id]?.display_name ?? 'Booster'
    setSelectedCoachPackage({ id: p.id, title: p.title, price: p.price, tempo: p.tempo })
    setPreferredBooster(p.booster_id, boosterName)
    setBasePrice(p.price)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-ink mb-1">Escolha um Pacote de Coach</h2>
        <p className="text-sm text-ink-secondary">Busque e filtre entre os pacotes de todos os coaches disponíveis.</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por título, descrição ou nome do coach..."
          className="input-base pl-9 w-full text-sm"
        />
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {LANES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setLaneFilter(f => f === key ? null : key)}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-bold border transition-all',
                laneFilter === key
                  ? 'bg-brand/15 border-brand text-brand'
                  : 'border-bg-elevated text-ink-secondary hover:border-brand/40',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COACH_SPECIALTIES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSpecialtyFilter(f => f === key ? null : key)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all',
                specialtyFilter === key
                  ? 'bg-brand/15 border-brand text-brand'
                  : 'border-bg-elevated text-ink-muted hover:border-brand/40',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <p className="text-sm text-ink-muted py-6 text-center">Carregando pacotes...</p>
      ) : !filtered.length ? (
        <p className="text-sm text-ink-muted py-6 text-center">Nenhum pacote encontrado com esses filtros.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
          {filtered.map(p => {
            const booster = boosterMap[p.booster_id]
            const selected = selectedCoachPackage?.id === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPackage(p)}
                className={cn(
                  'text-left rounded-2xl border-2 p-4 flex flex-col gap-2 transition-all',
                  selected
                    ? 'border-brand bg-brand/10'
                    : 'border-bg-elevated bg-bg-card hover:border-brand/30',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-ink">{p.title}</p>
                  {selected && <CheckCircle2 className="h-4 w-4 text-brand shrink-0" />}
                </div>
                {booster && (
                  <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
                    <span>{booster.display_name}</span>
                    {booster.rating != null && (
                      <span className="flex items-center gap-0.5 text-ink-muted">
                        <Star className="h-3 w-3 fill-warning text-warning" />
                        {booster.rating.toFixed(1)}
                      </span>
                    )}
                    {booster.is_top5 && (
                      <span className="text-[10px] font-bold bg-warning/10 text-warning border border-warning/20 rounded px-1.5 py-0.5 uppercase">Top 5</span>
                    )}
                  </div>
                )}
                {p.description && (
                  <p className="text-xs text-ink-secondary leading-relaxed line-clamp-2">{p.description}</p>
                )}
                {(p.lanes?.length || p.specialties?.length) && (
                  <div className="flex flex-wrap gap-1">
                    {p.lanes?.map(l => (
                      <span key={l} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand/10 text-brand">{LANE_LABEL[l] ?? l}</span>
                    ))}
                    {p.specialties?.map(s => (
                      <span key={s} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-bg-elevated text-ink-muted">{SPECIALTY_LABEL[s] ?? s}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-auto pt-2 border-t border-bg-elevated">
                  {p.tempo && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-ink-muted" />
                      <span className="text-[11px] text-ink-secondary">{p.tempo}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 ml-auto">
                    <DollarSign className="h-3 w-3 text-brand" />
                    <span className="text-sm font-bold text-brand">{currency(p.price)}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

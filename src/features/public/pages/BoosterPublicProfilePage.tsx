import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Star, Clock, CheckCircle2, Trophy, TrendingUp, Zap, DollarSign, Package, MessageSquare } from 'lucide-react'
import { Button, Card, RankBadge, Avatar, Skeleton, StarRating, EmptyState } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { timeAgo, formatRank, formatDate } from '@/lib/utils'
import { LANE_LABEL, SPECIALTY_LABEL } from '@/lib/lolTaxonomy'
import type { BoosterProfile, BoosterService, Review, RankTier } from '@/types'
import { useCurrency } from '@/hooks/useCurrency'

// ── Helpers ───────────────────────────────────────────────────────────────────

type RankGroup = 'gold_minus' | 'plat_diamond' | 'master_plus'

const RANK_GROUPS: { key: RankGroup; label: string; sublabel: string; tiers: RankTier[] }[] = [
  { key: 'gold_minus',   label: 'Gold e Abaixo',     sublabel: 'Ferro · Bronze · Prata · Ouro',      tiers: ['iron', 'bronze', 'silver', 'gold'] },
  { key: 'plat_diamond', label: 'Platina - Diamante', sublabel: 'Platina · Esmeralda · Diamante',     tiers: ['platinum', 'emerald', 'diamond'] },
  { key: 'master_plus',  label: 'Mestre+',            sublabel: 'Mestre · Grão-mestre · Desafiante',  tiers: ['master', 'grandmaster', 'challenger'] },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export function BoosterPublicProfilePage() {
  const { id } = useParams<{ id: string }>()
  const currency = useCurrency()

  const { data: booster, isLoading } = useQuery({
    queryKey: ['public-booster', id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('public_booster_profiles')
        .select('*')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return data as BoosterProfile | null
    },
    enabled: !!id,
  })

  const { data: services = [] } = useQuery({
    queryKey: ['public-booster-services', booster?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booster_services')
        .select('*')
        .eq('booster_id', booster!.user_id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as BoosterService[]
    },
    enabled: !!booster?.user_id,
  })

  const { data: reviews = [] } = useQuery({
    queryKey: ['public-booster-reviews', booster?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('id, rating, content, created_at')
        .eq('booster_id', booster!.user_id)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as Pick<Review, 'id' | 'rating' | 'content' | 'created_at'>[]
    },
    enabled: !!booster?.user_id,
  })

  if (isLoading) return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-16 space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-48 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  )

  if (!booster) return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-16 text-center">
      <p className="text-ink-secondary">Booster não encontrado.</p>
      <Button asChild variant="ghost" className="mt-4">
        <Link to="/boosters">Voltar</Link>
      </Button>
    </div>
  )

  const hasRankStats  = booster.rank_stats && Object.keys(booster.rank_stats).length > 0
  const rankGroups = RANK_GROUPS.filter(group => booster.rank_stats?.[group.key])
  const hasLanes      = booster.lanes && booster.lanes.length > 0
  const hasSpecialties = booster.specialties && booster.specialties.length > 0

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-16 space-y-6">
      {/* Back */}
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/boosters"><ArrowLeft className="h-4 w-4 mr-1" /> Todos os Boosters</Link>
      </Button>

      {/* Hero card */}
      <Card padding="lg">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div className="relative shrink-0">
            <Avatar src={booster.avatar_url} name={booster.display_name} size="xl" />
            {booster.is_available && (
              <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-success border-2 border-bg-surface" title="Disponível" />
            )}
          </div>

          <div className="flex-1 text-center sm:text-left space-y-2">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h1 className="text-xl font-extrabold text-ink">{booster.display_name}</h1>
              {booster.is_top5 && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-warning bg-warning/10 border border-warning/20 px-2 py-0.5 rounded-full">
                  <Trophy className="h-3 w-3" /> Top 5
                </span>
              )}
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                booster.is_available
                  ? 'text-success bg-success/10 border-success/20'
                  : 'text-ink-muted bg-bg-elevated border-bg-overlay'
              }`}>
                {booster.is_available ? 'Disponível' : 'Indisponível'}
              </span>
            </div>

            {booster.rating_count > 0 && (
              <div className="flex justify-center sm:justify-start">
                <StarRating rating={booster.rating} count={booster.rating_count} />
              </div>
            )}

            {booster.bio && (
              <p className="text-sm text-ink-secondary leading-relaxed">{booster.bio}</p>
            )}

            {/* Lanes */}
            {hasLanes && (
              <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start pt-1">
                {booster.lanes!.map(lane => (
                  <span
                    key={lane}
                    className="px-2.5 py-0.5 rounded-full bg-brand/10 border border-brand/20 text-[11px] font-bold text-brand"
                  >
                    {LANE_LABEL[lane] ?? lane}
                  </span>
                ))}
              </div>
            )}

            {/* Specialties */}
            {hasSpecialties && (
              <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start">
                {booster.specialties!.map(s => (
                  <span
                    key={s}
                    className="px-2.5 py-0.5 rounded-full bg-bg-elevated text-[11px] font-medium text-ink-secondary"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>

          {booster.current_rank && (
            <div className="shrink-0 text-center">
              <p className="text-[10px] text-ink-muted mb-1">Rank Atual</p>
              <RankBadge
                tier={booster.current_rank.tier as RankTier}
                division={booster.current_rank.division}
                size="md"
                showLabel={false}
              />
              <p className="text-[10px] font-semibold text-ink-secondary mt-1">
                {formatRank(booster.current_rank.tier as RankTier, booster.current_rank.division)}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: CheckCircle2, label: 'Concluídos',    value: String(booster.total_completed),            color: 'text-success'        },
          { icon: Star,         label: 'Avaliação',     value: booster.rating_count > 0 ? `${booster.rating.toFixed(1)} / 5` : '—', color: 'text-warning' },
          { icon: Clock,        label: 'Visto por último', value: booster.last_active_at ? timeAgo(booster.last_active_at) : '—', color: 'text-ink-secondary' },
          { icon: TrendingUp,   label: 'Rank Máximo',  value: booster.peak_rank ? `${booster.peak_rank.tier}${booster.peak_rank.division ? ' ' + booster.peak_rank.division : ''}` : '—', color: 'text-brand' },
        ].map(({ icon: Icon, label, value, color }) => (
          <Card key={label} padding="md" className="flex flex-col gap-1">
            <Icon className={`h-4 w-4 ${color}`} />
            <p className="text-[10px] text-ink-muted mt-1">{label}</p>
            <p className="text-sm font-bold text-ink capitalize">{value}</p>
          </Card>
        ))}
      </div>

      {/* Pacotes de coach */}
      {services.length > 0 && (
        <Card padding="md">
          <div className="flex items-center gap-2 mb-4">
            <Package className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-bold text-ink">Pacotes de Coach</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {services.map(s => (
              <div key={s.id} className="rounded-xl border border-bg-elevated bg-bg-elevated/30 p-4 flex flex-col gap-2">
                <p className="text-sm font-bold text-ink">{s.title}</p>
                {s.description && (
                  <p className="text-xs text-ink-secondary leading-relaxed flex-1">{s.description}</p>
                )}
                {(s.lanes?.length || s.specialties?.length) && (
                  <div className="flex flex-wrap gap-1.5">
                    {s.lanes?.map(l => (
                      <span key={l} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20">
                        {LANE_LABEL[l] ?? l}
                      </span>
                    ))}
                    {s.specialties?.map(sp => (
                      <span key={sp} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-bg-elevated text-ink-secondary">
                        {SPECIALTY_LABEL[sp] ?? sp}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-auto pt-2 border-t border-bg-elevated">
                  {s.tempo && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-ink-muted" />
                      <span className="text-[11px] text-ink-secondary">{s.tempo}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 ml-auto">
                    <DollarSign className="h-3 w-3 text-brand" />
                    <span className="text-sm font-bold text-brand">{currency(s.price)}</span>
                  </div>
                </div>
                <Button asChild size="sm" className="w-full mt-1">
                  <Link to={`/orders/new?service=coaching&booster=${booster.user_id}&coach_package=${s.id}`}>Contratar</Link>
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Rank stats */}
      <Card padding="md">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-bold text-ink">Desempenho por Faixa de Elo</h2>
        </div>

        {!hasRankStats ? (
          <p className="text-xs text-ink-muted py-4 text-center">Estatísticas ainda não informadas.</p>
        ) : (
          <div className="space-y-3">
            {rankGroups.map(g => {
              const stats = booster.rank_stats?.[g.key]
              return (
                <div key={g.key} className="flex items-center gap-4 py-3 border-b border-bg-elevated last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1 mb-2">
                      {g.tiers.map(tier => (
                        <RankBadge key={tier} tier={tier} size="xs" showDivision={false} showLabel={false} />
                      ))}
                    </div>
                    <p className="text-xs font-semibold text-ink">{g.label}</p>
                    <p className="text-[10px] text-ink-muted">{g.sublabel}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-6 text-right">
                    <div>
                      <p className="text-[10px] text-ink-muted">KDA Médio</p>
                      <p className="text-sm font-bold text-ink">{stats?.kda != null ? stats.kda.toFixed(1) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-ink-muted">Winrate</p>
                      <p className="text-sm font-bold text-brand">{stats?.winrate != null ? `${stats.winrate}%` : '—'}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Avaliações */}
      <Card padding="md">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-bold text-ink">Avaliações</h2>
        </div>
        {!reviews.length ? (
          <EmptyState icon={MessageSquare} title="Este booster ainda não recebeu avaliações." />
        ) : (
          <div className="space-y-3">
            {reviews.map(review => (
              <div key={review.id} className="rounded-xl border border-bg-elevated p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <StarRating rating={review.rating} size="xs" showValue={false} />
                  <span className="text-[10px] text-ink-muted">{formatDate(review.created_at)}</span>
                </div>
                {review.content && <p className="text-xs text-ink-secondary leading-relaxed">{review.content}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* CTA */}
      <Card padding="md" variant="brand" className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-ink">Quer boostar com {booster.display_name}?</p>
          <p className="text-xs text-ink-secondary mt-0.5">Faça um pedido e o booster poderá aceitar.</p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link to={`/orders/new?booster=${booster.user_id}`}>Fazer Pedido</Link>
        </Button>
      </Card>
    </div>
  )
}

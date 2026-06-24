import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Zap, Star, Trophy } from 'lucide-react'
import { Avatar, Skeleton, RankBadge } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { cn, formatRank } from '@/lib/utils'
import type { BoosterProfile, RankTier } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function overallWinRate(b: BoosterProfile): number {
  const s = b.rank_stats
  if (!s) return 0
  const values = [s.gold_minus?.winrate, s.plat_diamond?.winrate, s.master_plus?.winrate]
    .filter((v): v is number => v !== undefined)
  return values.length ? values.reduce((a, c) => a + c, 0) / values.length : 0
}

const MEDAL: Record<number, { border: string; badge: string; text: string }> = {
  1: { border: 'border-yellow-400/60', badge: 'bg-yellow-400 text-bg-base', text: 'text-yellow-400' },
  2: { border: 'border-slate-300/50',  badge: 'bg-slate-300 text-bg-base',  text: 'text-slate-300'  },
  3: { border: 'border-amber-500/50',  badge: 'bg-amber-500 text-white',     text: 'text-amber-500'  },
}

// DOM order: 4th | 2nd | 1st | 3rd | 5th (classic podium staircase)
const PODIUM_SLOTS = [
  { arrIdx: 3, pos: 4, pt: 'pt-20', w: 'w-28' },
  { arrIdx: 1, pos: 2, pt: 'pt-10', w: 'w-36' },
  { arrIdx: 0, pos: 1, pt: 'pt-0',  w: 'w-44' },
  { arrIdx: 2, pos: 3, pt: 'pt-10', w: 'w-36' },
  { arrIdx: 4, pos: 5, pt: 'pt-20', w: 'w-28' },
]

// ── PodiumCard ────────────────────────────────────────────────────────────────

function PodiumCard({ booster, position }: { booster: BoosterProfile; position: number }) {
  const winRate = overallWinRate(booster)
  const medal = MEDAL[position]
  const isFirst = position === 1

  return (
    <Link
      to={`/boosters/${booster.id}`}
      className={cn(
        'flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all hover:-translate-y-1 hover:shadow-card-hover bg-bg-card w-full',
        medal ? medal.border : 'border-bg-elevated',
      )}
    >
      {/* Position badge */}
      {medal ? (
        <span className={cn('h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0', medal.badge)}>
          {position}
        </span>
      ) : (
        <span className="text-[10px] font-bold text-ink-muted">#{position}</span>
      )}

      {/* Avatar */}
      <div className="relative">
        <Avatar name={booster.display_name} size={isFirst ? 'lg' : 'md'} />
        {booster.is_available && (
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-success border-2 border-bg-card" />
        )}
      </div>

      {/* Name */}
      <p className={cn('font-bold text-ink text-center w-full truncate', isFirst ? 'text-sm' : 'text-xs')}>
        {booster.display_name}
      </p>

      {/* Win rate */}
      <div className="text-center">
        <p className={cn(
          'font-extrabold leading-none',
          isFirst ? 'text-2xl' : position <= 3 ? 'text-xl' : 'text-lg',
          medal ? medal.text : 'text-brand',
        )}>
          {winRate > 0 ? `${winRate.toFixed(1)}%` : '—'}
        </p>
        <p className="text-[9px] text-ink-muted mt-0.5">winrate</p>
      </div>

      {/* Rating */}
      {booster.rating_count > 0 && (
        <div className="flex items-center gap-0.5">
          <Star className="h-3 w-3 text-warning fill-warning" />
          <span className="text-[10px] font-semibold text-ink">{booster.rating.toFixed(1)}</span>
        </div>
      )}

      {/* Orders */}
      {booster.total_completed > 0 && (
        <p className="text-[9px] text-ink-muted">{booster.total_completed} pedidos</p>
      )}
    </Link>
  )
}

// ── BoosterCard (grid) ────────────────────────────────────────────────────────

function BoosterCard({ booster }: { booster: BoosterProfile }) {
  const winRate = overallWinRate(booster)

  return (
    <Link to={`/boosters/${booster.id}`}>
      <div className="card flex flex-col items-center text-center gap-3 p-4 hover:border-brand/30 hover:shadow-card-hover transition-all cursor-pointer h-full">
        <div className="relative">
          <Avatar name={booster.display_name} size="lg" />
          {booster.is_available && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-success border-2 border-bg-surface" />
          )}
        </div>

        <p className="text-sm font-bold text-ink truncate w-full">{booster.display_name}</p>

        {winRate > 0 && (
          <div className="text-center">
            <p className="text-lg font-extrabold text-brand leading-none">{winRate.toFixed(1)}%</p>
            <p className="text-[9px] text-ink-muted">winrate</p>
          </div>
        )}

        {booster.current_rank && (
          <div className="flex flex-col items-center gap-1">
            <RankBadge
              tier={booster.current_rank.tier as RankTier}
              division={booster.current_rank.division}
              size="sm"
              showLabel={false}
            />
            <span className="text-[10px] font-semibold text-ink-secondary">
              {formatRank(booster.current_rank.tier as RankTier, booster.current_rank.division)}
            </span>
          </div>
        )}

        {booster.rating_count > 0 ? (
          <div className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 text-warning fill-warning" />
            <span className="text-xs font-semibold text-ink">{booster.rating.toFixed(1)}</span>
            <span className="text-[10px] text-ink-muted">({booster.rating_count})</span>
          </div>
        ) : (
          <span className="text-[10px] text-ink-muted">Sem avaliações ainda</span>
        )}
      </div>
    </Link>
  )
}

function BoosterCardSkeleton() {
  return (
    <div className="card flex flex-col items-center gap-3 p-4">
      <Skeleton className="h-12 w-12 rounded-full" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-6 w-16" />
      <Skeleton className="h-3 w-16" />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function BoostersPage() {
  const { data: boosters, isLoading } = useQuery({
    queryKey: ['public-boosters'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('public_booster_profiles')
        .select('*')
      if (error) throw error
      return data as BoosterProfile[]
    },
    staleTime: 60_000,
  })

  const sorted = boosters
    ? [...boosters].sort((a, b) => overallWinRate(b) - overallWinRate(a))
    : []
  const top5 = sorted.slice(0, 5)
  const rest  = sorted.slice(5)

  return (
    <div className="max-w-screen-xl mx-auto px-5 sm:px-8 py-16">
      {/* Header */}
      <div className="text-center mb-14">
        <div className="inline-flex items-center gap-2 bg-brand/10 border border-brand/20 text-brand text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
          <Zap className="h-3.5 w-3.5" />
          Boosters Verificados
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-ink mb-3">
          Nossos <span className="text-brand">Boosters</span>
        </h1>
        <p className="text-ink-secondary max-w-xl mx-auto text-sm leading-relaxed">
          Todos os boosters são verificados e aprovados manualmente. Clique em um perfil para ver estatísticas detalhadas.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => <BoosterCardSkeleton key={i} />)}
        </div>
      ) : !sorted.length ? (
        <div className="text-center py-20">
          <p className="text-ink-secondary text-sm">Nenhum booster disponível no momento.</p>
        </div>
      ) : (
        <div className="space-y-16">

          {/* ── Top 5 Podium ── */}
          {top5.length > 0 && (
            <section>
              <div className="flex items-center justify-center gap-2 mb-10">
                <Trophy className="h-5 w-5 text-yellow-400" />
                <h2 className="text-xl font-black text-ink">Top 5 Boosters</h2>
                <Trophy className="h-5 w-5 text-yellow-400" />
              </div>

              <div className="overflow-x-auto pb-2">
                <div className="flex items-start justify-center gap-3 min-w-max mx-auto px-4">
                  {PODIUM_SLOTS.map(({ arrIdx, pos, pt, w }) => {
                    const b = top5[arrIdx]
                    if (!b) return null
                    return (
                      <motion.div
                        key={b.id}
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: arrIdx * 0.08 }}
                        className={cn('shrink-0', pt, w)}
                      >
                        <PodiumCard booster={b} position={pos} />
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            </section>
          )}

          {/* ── Rest of boosters ── */}
          {rest.length > 0 && (
            <section>
              <p className="text-xs font-bold uppercase tracking-widest text-ink-muted text-center mb-8">
                Demais Boosters
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {rest.map(b => (
                  <motion.div
                    key={b.id}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35 }}
                  >
                    <BoosterCard booster={b} />
                  </motion.div>
                ))}
              </div>
            </section>
          )}

        </div>
      )}
    </div>
  )
}

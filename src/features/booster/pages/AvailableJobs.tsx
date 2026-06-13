import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Briefcase, Filter, Lock } from 'lucide-react'
import { Button, Card, EmptyState, Skeleton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { formatRank, timeAgo } from '@/lib/utils'
import type { Order, QueueType } from '@/types'
import { useTranslation } from 'react-i18next'
import { useCurrency } from '@/hooks/useCurrency'

const SERVER_OPTIONS = ['All', 'NA', 'EUW', 'EUNE', 'BR', 'OCE', 'KR']

export function AvailableJobsPage() {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()
  const [server, setServer] = useState('All')
  const [queue, setQueue] = useState<QueueType | 'all'>('all')
  const { t } = useTranslation()
  const currency = useCurrency()

  const QUEUE_OPTIONS: { label: string; value: QueueType | 'all' }[] = [
    { label: 'All Queues', value: 'all' },
    { label: t('booster.jobs.soloQueue'), value: 'solo_duo' },
    { label: t('booster.jobs.flexQueue'), value: 'flex' },
  ]

  // Reuse cached value from BoosterLayout
  const { data: boosterProfile } = useQuery({
    queryKey: ['booster-profile', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('booster_profiles')
        .select('status')
        .eq('user_id', profile!.id)
        .maybeSingle()
      return data
    },
    enabled: !!profile?.id,
  })

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['available-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('status', 'awaiting_assignment')
        .order('created_at', { ascending: true })
        .limit(50)
      if (error) throw error
      return data as Order[]
    },
    refetchInterval: 15000,
  })

  const acceptJob = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'assigned',
          assigned_booster_id: profile?.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .eq('status', 'awaiting_assignment') // optimistic lock
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['available-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['booster-assigned-orders'] })
    },
  })

  const filtered = jobs?.filter((j) => {
    if (server !== 'All' && j.server !== server) return false
    if (queue !== 'all' && j.queue_type !== queue) return false
    return true
  }) ?? []

  // Block access until the booster profile is approved by an admin
  if (boosterProfile && boosterProfile.status !== 'approved') {
    const statusMessages: Record<string, { title: string; desc: string }> = {
      pending:      { title: t('booster.jobs.locked.pending'), desc: t('booster.jobs.locked.pendingDesc') },
      under_review: { title: t('booster.jobs.locked.under_review'), desc: t('booster.jobs.locked.under_reviewDesc') },
      suspended:    { title: t('booster.jobs.locked.suspended'), desc: t('booster.jobs.locked.suspendedDesc') },
    }
    const msg = statusMessages[boosterProfile.status] ?? { title: t('booster.jobs.locked.default'), desc: t('booster.jobs.locked.defaultDesc') }
    return (
      <div className="max-w-4xl">
        <EmptyState
          icon={Lock}
          title={msg.title}
          description={msg.desc}
        />
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t('booster.jobs.title')}</h1>
          <p className="text-sm text-ink-secondary mt-1">
            {t('booster.jobs.count', { count: filtered.length })}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-slow" />
          {t('booster.jobs.live')}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-bg-surface border border-bg-elevated rounded-xl px-3 py-1">
          <Filter className="h-3.5 w-3.5 text-ink-muted" />
          <div className="flex gap-1">
            {SERVER_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setServer(s)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  server === s ? 'bg-brand text-white' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1 bg-bg-surface border border-bg-elevated rounded-xl p-1">
          {QUEUE_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setQueue(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                queue === value ? 'bg-brand text-white' : 'text-ink-secondary hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Jobs */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
      ) : !filtered.length ? (
        <EmptyState icon={Briefcase} title={t('booster.jobs.empty')} description={t('booster.jobs.emptyDesc')} />
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => (
            <Card key={job.id} className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs font-mono text-ink-muted">#{job.id.slice(0, 8).toUpperCase()}</span>
                  <span className="text-xs bg-bg-elevated text-ink-secondary px-2 py-0.5 rounded-lg">{job.server}</span>
                  <span className="text-xs bg-bg-elevated text-ink-secondary px-2 py-0.5 rounded-lg">
                    {job.queue_type === 'solo_duo' ? t('booster.jobs.soloQueue') : t('booster.jobs.flexQueue')}
                  </span>
                </div>
                {job.current_rank && job.target_rank && (
                  <p className="text-sm font-semibold text-ink">
                    {formatRank((job.current_rank as { tier: string }).tier as never, (job.current_rank as { division: string }).division)}
                    {' → '}
                    {formatRank((job.target_rank as { tier: string }).tier as never, (job.target_rank as { division: string }).division)}
                  </p>
                )}
                <p className="text-xs text-ink-muted mt-0.5">{t('booster.jobs.posted', { time: timeAgo(job.created_at) })}</p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <p className="text-sm font-bold text-success">{currency(job.total_price * 0.75)}</p>
                  <p className="text-[10px] text-ink-muted">{t('booster.jobs.yourCut')}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => acceptJob.mutate(job.id)}
                  loading={acceptJob.isPending}
                >
                  {t('booster.jobs.accept')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

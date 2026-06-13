import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, DollarSign, Star, TrendingUp, Clock, ChevronRight } from 'lucide-react'
import { Button, Card, OrderStatusBadge, Skeleton, EmptyState } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency, formatRank, timeAgo } from '@/lib/utils'
import type { Order, BoosterProfile } from '@/types'

function useBoosterProfile(userId: string) {
  return useQuery({
    queryKey: ['booster-profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booster_profiles')
        .select('*')
        .eq('user_id', userId)
        .single()
      if (error) throw error
      return data as BoosterProfile
    },
  })
}

function useAssignedOrders(boosterId: string) {
  return useQuery({
    queryKey: ['booster-assigned-orders', boosterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('assigned_booster_id', boosterId)
        .in('status', ['assigned', 'in_progress', 'paused', 'awaiting_customer'])
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Order[]
    },
  })
}

export function BoosterDashboard() {
  const { profile } = useAuthStore()
  const { data: boosterProfile, isLoading: profileLoading } = useBoosterProfile(profile?.id ?? '')
  const { data: activeOrders, isLoading: ordersLoading } = useAssignedOrders(boosterProfile?.id ?? '')

  if (profileLoading) return <Skeleton className="h-64 w-full" />

  // If not yet approved, show onboarding notice
  if (boosterProfile?.status !== 'approved') {
    return (
      <div className="max-w-xl">
        <Card padding="lg" variant="brand" className="text-center">
          <div className="h-14 w-14 rounded-2xl bg-warning/10 flex items-center justify-center mx-auto mb-4">
            <Clock className="h-7 w-7 text-warning" />
          </div>
          <h2 className="text-xl font-bold text-ink mb-2">Application Under Review</h2>
          <p className="text-ink-secondary text-sm">
            Your booster application is currently being reviewed by our team.
            We'll notify you once your account is approved.
          </p>
          <p className="mt-3 text-xs text-ink-muted">Status: <strong className="text-warning">{boosterProfile?.status ?? 'pending'}</strong></p>
        </Card>
      </div>
    )
  }

  const completedCount = boosterProfile?.total_completed ?? 0
  const rating = boosterProfile?.rating ?? 0
  const earnings = boosterProfile?.total_earnings ?? 0

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Booster Dashboard</h1>
          <p className="text-ink-secondary mt-1">
            {activeOrders?.length
              ? `${activeOrders.length} active assignment${activeOrders.length > 1 ? 's' : ''}`
              : 'No active assignments right now.'}
          </p>
        </div>
        <Button asChild>
          <Link to="/booster/jobs">
            <Briefcase className="h-4 w-4" />
            Browse Jobs
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Orders', value: activeOrders?.length ?? 0, icon: Briefcase, color: 'text-brand bg-brand-muted' },
          { label: 'Completed', value: completedCount, icon: TrendingUp, color: 'text-success bg-success/10' },
          { label: 'Total Earned', value: formatCurrency(earnings), icon: DollarSign, color: 'text-accent bg-accent/10' },
          { label: 'Rating', value: `${rating.toFixed(1)} ⭐`, icon: Star, color: 'text-warning bg-warning/10' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} padding="md">
            <div className={`h-8 w-8 rounded-lg ${color} flex items-center justify-center mb-3`}>
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold text-ink">{value}</p>
            <p className="text-xs text-ink-secondary mt-0.5">{label}</p>
          </Card>
        ))}
      </div>

      {/* Active assignments */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-ink">Active Assignments</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/booster/jobs">View all →</Link>
          </Button>
        </div>

        {ordersLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !activeOrders?.length ? (
          <EmptyState
            icon={Briefcase}
            title="No active assignments"
            description="Browse available jobs to pick up a new order."
            action={{ label: 'Browse Jobs', onClick: () => {} }}
          />
        ) : (
          <div className="space-y-3">
            {activeOrders.map((order) => (
              <Link key={order.id} to={`/booster/jobs/${order.id}`}>
                <Card className="flex items-center justify-between gap-4 hover:border-brand/20 hover:shadow-card-hover transition-all cursor-pointer">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-ink">#{order.id.slice(0, 8).toUpperCase()}</p>
                      <span className="text-xs text-ink-muted">{order.server}</span>
                    </div>
                    {order.current_rank && order.target_rank && (
                      <p className="text-xs text-ink-secondary">
                        {formatRank((order.current_rank as { tier: string }).tier as never, (order.current_rank as { division: string }).division)}
                        {' → '}
                        {formatRank((order.target_rank as { tier: string }).tier as never, (order.target_rank as { division: string }).division)}
                      </p>
                    )}
                    <p className="text-[10px] text-ink-muted mt-0.5">{timeAgo(order.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-bold text-success">{formatCurrency(order.total_price * 0.75)}</span>
                    <OrderStatusBadge status={order.status} />
                    <ChevronRight className="h-4 w-4 text-ink-muted" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, TrendingUp, Star } from 'lucide-react'
import { Card, Skeleton, StarRating } from '@/components/ui'
import { supabase } from '@/lib/supabase'

interface BoosterStatsData {
  total_completed: number
  rating: number
  rating_count: number
}

/**
 * Estatísticas profissionais com dado real — nunca inventa indicadores sem
 * fonte no banco (ex.: tempo médio de resposta e clientes únicos não têm
 * coluna/consulta hoje, então simplesmente não aparecem em vez de serem
 * fabricados).
 */
export function BoosterStats({ userId }: { userId: string }) {
  const { data: profileStats, isLoading: loadingProfile } = useQuery({
    queryKey: ['booster-profile-stats', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booster_profiles')
        .select('total_completed, rating, rating_count')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return data as BoosterStatsData | null
    },
    enabled: !!userId,
  })

  const { data: orderCounts, isLoading: loadingOrders } = useQuery({
    queryKey: ['booster-order-counts', userId],
    queryFn: async () => {
      const { count: total } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_booster_id', userId)
      const { count: completed } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_booster_id', userId)
        .eq('status', 'completed')
      return { total: total ?? 0, completed: completed ?? 0 }
    },
    enabled: !!userId,
  })

  const isLoading = loadingProfile || loadingOrders

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
      </div>
    )
  }

  const completionRate = orderCounts && orderCounts.total > 0
    ? Math.round((orderCounts.completed / orderCounts.total) * 100)
    : null

  return (
    <div>
      <h2 className="text-sm font-bold text-ink mb-3">Estatísticas</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card padding="md">
          <div className="h-8 w-8 rounded-lg bg-success/10 text-success flex items-center justify-center mb-3">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <p className="text-2xl font-bold text-ink">{profileStats?.total_completed ?? 0}</p>
          <p className="text-xs text-ink-secondary mt-0.5">Pedidos concluídos</p>
        </Card>

        <Card padding="md">
          <div className="h-8 w-8 rounded-lg bg-warning/10 text-warning flex items-center justify-center mb-3">
            <Star className="h-4 w-4" />
          </div>
          {profileStats?.rating_count ? (
            <StarRating rating={profileStats.rating} count={profileStats.rating_count} size="xs" />
          ) : (
            <p className="text-sm text-ink-muted">Sem avaliações ainda</p>
          )}
          <p className="text-xs text-ink-secondary mt-0.5">Avaliação média</p>
        </Card>

        {completionRate != null && (
          <Card padding="md">
            <div className="h-8 w-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center mb-3">
              <TrendingUp className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold text-ink">{completionRate}%</p>
            <p className="text-xs text-ink-secondary mt-0.5">Taxa de conclusão</p>
          </Card>
        )}
      </div>
    </div>
  )
}

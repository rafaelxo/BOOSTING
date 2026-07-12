import { useEffect, useMemo, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { EmptyState, Skeleton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { Order } from '@/types'
import { CompletedOrderCard } from '@/features/booster/components/CompletedOrderCard'

// Page size scales with viewport so wider screens (more grid columns) load
// proportionally more cards per batch than a single mobile column would.
function getPageSize(): number {
  if (typeof window === 'undefined') return 12
  const w = window.innerWidth
  if (w >= 1280) return 18 // xl: 3 cols × 6 rows
  if (w >= 768) return 12  // md: 2 cols × 6 rows
  return 6                 // mobile: 1 col × 6 rows
}

export function CompletedOrdersPage() {
  const { profile } = useAuthStore()
  const pageSize = useMemo(getPageSize, [])
  const sentinelRef = useRef<HTMLDivElement>(null)

  const {
    data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['booster-completed-orders', profile?.id, pageSize],
    queryFn: async ({ pageParam }) => {
      const from = pageParam * pageSize
      const to = from + pageSize - 1
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('assigned_booster_id', profile!.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .range(from, to)
      if (error) throw error
      return data as unknown as Order[]
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => (lastPage.length === pageSize ? allPages.length : undefined),
    enabled: !!profile?.id,
  })

  const orders = data?.pages.flat() ?? []

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    }, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Pedidos Concluídos</h1>
        <p className="text-sm text-ink-secondary mt-1">Todos os serviços que você já finalizou.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
        </div>
      ) : !orders.length ? (
        <EmptyState icon={CheckCircle2} title="Nenhum pedido concluído ainda" description="Seus serviços finalizados aparecerão aqui." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {orders.map((order) => <CompletedOrderCard key={order.id} order={order} />)}
          </div>
          <div ref={sentinelRef} className="h-4" />
          {isFetchingNextPage && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(Math.min(3, pageSize))].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

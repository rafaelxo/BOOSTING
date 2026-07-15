import { useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { EmptyState, Skeleton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { ORDER_SAFE_COLUMNS } from '@/lib/orderColumns'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import type { Order, OrderStatus } from '@/types'
import { CompletedOrderCard } from '@/features/booster/components/CompletedOrderCard'

// Agrupa o enum real de order_status em abas — nenhum status é excluído,
// só reorganizado para o contexto de "pedidos do booster" (o pool de pedidos
// ainda não aceitos, awaiting_assignment, é responsabilidade da página Jobs).
const TABS = [
  { key: 'active',    label: 'Em andamento', statuses: ['assigned', 'in_progress', 'paused', 'drop_requested', 'awaiting_customer'] as OrderStatus[] },
  { key: 'completed', label: 'Concluídos',   statuses: ['completed'] as OrderStatus[] },
  { key: 'canceled',  label: 'Cancelados',   statuses: ['canceled', 'refunded', 'disputed'] as OrderStatus[] },
] as const

type TabKey = typeof TABS[number]['key']

// Page size scales with viewport so wider screens (more grid columns) load
// proportionally more cards per batch than a single mobile column would.
function getPageSize(): number {
  if (typeof window === 'undefined') return 12
  const w = window.innerWidth
  if (w >= 1280) return 18 // xl: 3 cols × 6 rows
  if (w >= 768) return 12  // md: 2 cols × 6 rows
  return 6                 // mobile: 1 col × 6 rows
}

export function BoosterOrdersPage() {
  const { profile } = useAuthStore()
  const pageSize = useMemo(getPageSize, [])
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<TabKey>('active')
  const activeTab = TABS.find(t => t.key === tab)!

  const {
    data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['booster-orders', profile?.id, tab, pageSize],
    queryFn: async ({ pageParam }) => {
      const from = pageParam * pageSize
      const to = from + pageSize - 1
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SAFE_COLUMNS)
        .eq('assigned_booster_id', profile!.id)
        .in('status', activeTab.statuses)
        .order('created_at', { ascending: false })
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
        <h1 className="text-2xl font-bold text-ink">Pedidos</h1>
        <p className="text-sm text-ink-secondary mt-1">Todos os pedidos atribuídos a você, organizados por status.</p>
      </div>

      <div className="flex gap-1.5 border-b border-bg-elevated">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors',
              tab === key
                ? 'border-brand text-brand'
                : 'border-transparent text-ink-secondary hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
        </div>
      ) : !orders.length ? (
        <EmptyState icon={ClipboardList} title="Nenhum pedido aqui" description="Pedidos nesse status aparecerão aqui." />
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

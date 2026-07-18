import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/core/queryKeys'
import { useRealtimeInvalidate } from '@/api/core/realtime'
import { getAdminDashboardStats, getOrderSupportEscalation, listAdminDropRequests, listAdminPayments, listAdminRefunds } from './queries'
import { adminResolveOrderSupport, resolveDropRequest } from './mutations'

export function useAdminDashboardStats() {
  return useQuery({
    queryKey: queryKeys.admin.dashboardStats(),
    queryFn: getAdminDashboardStats,
    refetchInterval: 30_000,
  })
}

export function useAdminRefunds() {
  const query = useQuery({
    queryKey: queryKeys.admin.refunds(),
    queryFn: () => listAdminRefunds(),
    refetchInterval: 20_000,
  })
  useRealtimeInvalidate({
    channel: 'admin-refunds',
    table: 'refunds',
    queryKeys: [queryKeys.admin.refunds()],
  })
  return query
}

export function useAdminPayments() {
  const query = useQuery({
    queryKey: queryKeys.admin.payments(),
    queryFn: () => listAdminPayments(),
    refetchInterval: 20_000,
  })
  useRealtimeInvalidate({
    channel: 'admin-payments',
    table: 'payments',
    queryKeys: [queryKeys.admin.payments()],
  })
  return query
}

export function useAdminDropRequests() {
  const query = useQuery({
    queryKey: queryKeys.admin.drops(),
    queryFn: () => listAdminDropRequests(),
    refetchInterval: 15_000,
  })
  useRealtimeInvalidate({
    channel: 'admin-drop-requests',
    table: 'order_drop_requests',
    queryKeys: [queryKeys.admin.drops()],
  })
  return query
}

export function useOrderSupportEscalation(orderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orders.supportEscalation(orderId ?? ''),
    queryFn: () => getOrderSupportEscalation(orderId!),
    enabled: !!orderId,
  })
}

export function useResolveDropRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: resolveDropRequest,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.admin.drops() }),
  })
}

export function useAdminResolveOrderSupport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: adminResolveOrderSupport,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['orders', 'support-escalation'] }),
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/core/queryKeys'
import { getAdminDashboardStats, getOrderSupportEscalation, listAdminDropRequests, listAdminRefunds, listAuditLog } from './queries'
import { adminResolveOrderSupport, resolveDropRequest } from './mutations'

export function useAdminDashboardStats() {
  return useQuery({
    queryKey: queryKeys.admin.dashboardStats(),
    queryFn: getAdminDashboardStats,
    refetchInterval: 30_000,
  })
}

export function useAdminRefunds() {
  return useQuery({
    queryKey: queryKeys.admin.refunds(),
    queryFn: () => listAdminRefunds(),
    refetchInterval: 20_000,
  })
}

export function useAdminDropRequests() {
  return useQuery({
    queryKey: queryKeys.admin.drops(),
    queryFn: () => listAdminDropRequests(),
    refetchInterval: 15_000,
  })
}

export function useAuditLog(params: { entityType?: string; entityId?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.admin.auditLog(params),
    queryFn: () => listAuditLog(params),
  })
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

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/core/queryKeys'
import { useRealtimeInvalidate } from '@/api/core/realtime'
import type { OrderStatus } from '@/types'
import {
  getBoosterOrder, getBoosterSlotInfo, getCustomerOrderState, getOrder, getPendingDropRequest,
  listAdminOrders, listAvailableJobs, listBoosterOrdersPage, listCustomerOrders, listOrderMatches,
  listOrderStatusHistory,
} from './queries'
import {
  acceptBoostOrder, adminDropOrder, adminOverrideOrderStatus, cancelPendingOrder, confirmOrderCompletion,
  disputeOrderCompletion, generatePix, requestOrderDrop, requestOrderSupport,
  revealOrderCredentials, setOrderCredentials, syncOrderMatches, updateOrderStatus,
  verifyOrderRank,
} from './mutations'
import type { BoosterOrdersTab } from './types'

// Pedido individual: Realtime + fallback conservador (30s) no lugar do
// polling agressivo de 4-15s que existia em cada página antes desta camada.
// Assina order_status_events (não orders diretamente) -- orders nunca entra
// na publicação supabase_realtime pra não transmitir a linha inteira (preço,
// notas, dados do cliente) pra quem estiver com o canal aberto (ver migration
// 042/088); o evento mínimo só dispara um refetch normal, que já respeita RLS.
export function useOrder(orderId: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.orders.detail(orderId ?? ''),
    queryFn: () => getOrder(orderId!),
    enabled: !!orderId,
    refetchInterval: 30_000,
  })
  useRealtimeInvalidate({
    channel: `order-${orderId ?? 'none'}`,
    table: 'order_status_events',
    event: 'INSERT',
    filter: orderId ? `order_id=eq.${orderId}` : undefined,
    queryKeys: orderId ? [queryKeys.orders.detail(orderId)] : [],
    enabled: !!orderId,
  })
  return query
}

export function useBoosterOrder(orderId: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.orders.detail(orderId ?? ''),
    queryFn: () => getBoosterOrder(orderId!),
    enabled: !!orderId,
    refetchInterval: 15_000,
  })
  useRealtimeInvalidate({
    channel: `booster-order-${orderId ?? 'none'}`,
    table: 'order_status_events',
    event: 'INSERT',
    filter: orderId ? `order_id=eq.${orderId}` : undefined,
    queryKeys: orderId ? [queryKeys.orders.detail(orderId)] : [],
    enabled: !!orderId,
  })
  return query
}

export function useCustomerOrders(customerId: string | undefined, limit?: number) {
  const query = useQuery({
    queryKey: queryKeys.orders.customerList(customerId ?? '', { limit }),
    queryFn: () => listCustomerOrders(customerId!, limit),
    enabled: !!customerId,
    refetchInterval: 30_000,
  })
  // Sem filter= aqui de propósito -- order_status_events não tem coluna
  // customer_id pra filtrar na assinatura. RLS da própria tabela (migration
  // 088) já restringe o que este cliente recebe às linhas dos pedidos dele.
  useRealtimeInvalidate({
    channel: `customer-orders-${customerId ?? 'none'}`,
    table: 'order_status_events',
    event: 'INSERT',
    queryKeys: customerId ? [queryKeys.orders.customerList(customerId, { limit })] : [],
    enabled: !!customerId,
  })
  return query
}

export function useAvailableJobs() {
  const query = useQuery({
    queryKey: queryKeys.orders.availableJobs(),
    queryFn: () => listAvailableJobs(),
    refetchInterval: 30_000,
  })
  useRealtimeInvalidate({
    channel: 'available-jobs',
    table: 'booster_order_events',
    event: 'INSERT',
    queryKeys: [queryKeys.orders.availableJobs()],
  })
  return query
}

export function useBoosterOrdersInfinite(boosterId: string | undefined, tab: BoosterOrdersTab, pageSize: number) {
  return useInfiniteQuery({
    queryKey: queryKeys.orders.boosterList(boosterId ?? '', { tab, pageSize }),
    queryFn: ({ pageParam }) => listBoosterOrdersPage({ boosterId: boosterId!, tab, offset: pageParam, pageSize }),
    enabled: !!boosterId,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    refetchInterval: 30_000,
  })
}

export function useAdminOrders(status?: OrderStatus | 'all') {
  const query = useQuery({
    queryKey: queryKeys.orders.adminList({ status }),
    queryFn: () => listAdminOrders(status),
    refetchInterval: 30_000,
  })
  useRealtimeInvalidate({
    channel: 'admin-orders',
    table: 'order_status_events',
    event: 'INSERT',
    queryKeys: [queryKeys.orders.adminList({ status })],
  })
  return query
}

export function useOrderStatusHistory(orderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orders.detail(orderId ?? '').concat(['history']),
    queryFn: () => listOrderStatusHistory(orderId!),
    enabled: !!orderId,
  })
}

export function useOrderMatches(orderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orders.matches(orderId ?? ''),
    queryFn: () => listOrderMatches(orderId!),
    enabled: !!orderId,
  })
}

export function usePendingDropRequest(orderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orders.detail(orderId ?? '').concat(['drop-request']),
    queryFn: () => getPendingDropRequest(orderId!),
    enabled: !!orderId,
    refetchInterval: 30_000,
  })
}

export function useCustomerOrderState(orderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orders.state(orderId ?? ''),
    queryFn: () => getCustomerOrderState(orderId),
    enabled: !!orderId,
  })
}

export function useBoosterSlotInfo(boosterId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['booster-slots', boosterId ?? ''],
    queryFn: () => getBoosterSlotInfo(boosterId!),
    enabled: !!boosterId && enabled,
    refetchInterval: 20_000,
  })
}

function invalidateOrder(queryClient: ReturnType<typeof useQueryClient>, orderId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(orderId) })
  void queryClient.invalidateQueries({ queryKey: queryKeys.orders.state(orderId) })
}

export function useSetOrderCredentials(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: setOrderCredentials,
    onSuccess: () => invalidateOrder(queryClient, orderId),
  })
}

export function useConfirmOrderCompletion(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => confirmOrderCompletion(orderId),
    onSuccess: () => invalidateOrder(queryClient, orderId),
  })
}

export function useDisputeOrderCompletion(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) => disputeOrderCompletion({ orderId, reason }),
    onSuccess: () => invalidateOrder(queryClient, orderId),
  })
}

export function useUpdateOrderStatus(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (newStatus: OrderStatus) => updateOrderStatus({ orderId, newStatus }),
    onSuccess: () => invalidateOrder(queryClient, orderId),
  })
}

export function useAdminOverrideOrderStatus(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: adminOverrideOrderStatus,
    onSuccess: () => invalidateOrder(queryClient, orderId),
  })
}

export function useAdminDropOrder(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) => adminDropOrder({ orderId, reason }),
    onSuccess: () => invalidateOrder(queryClient, orderId),
  })
}

export function useRequestOrderDrop(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) => requestOrderDrop({ orderId, reason }),
    onSuccess: () => {
      invalidateOrder(queryClient, orderId)
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(orderId).concat(['drop-request']) })
    },
  })
}

export function useRevealOrderCredentials() {
  return useMutation({ mutationFn: revealOrderCredentials })
}

export function useAcceptBoostOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: acceptBoostOrder,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.availableJobs() })
      void queryClient.invalidateQueries({ queryKey: ['booster-slots'] })
      void queryClient.invalidateQueries({ queryKey: ['orders', 'booster'] })
    },
  })
}

export function useGeneratePix(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => generatePix(orderId),
    onSuccess: () => invalidateOrder(queryClient, orderId),
  })
}

export function useCancelPendingOrder() {
  return useMutation({ mutationFn: cancelPendingOrder })
}

export function useSyncOrderMatches(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => syncOrderMatches(orderId),
    onSuccess: () => {
      invalidateOrder(queryClient, orderId)
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.matches(orderId) })
      // Partidas sincronizadas podem ter mudado o resultado (wins_played,
      // vitórias/derrotas) -- o card de Progresso lê a mesma order.detail já
      // invalidada acima, mas a barra de rank (elo_boost) lê separadamente a
      // última verificação: invalida aqui também pra nunca ficar com dado velho.
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.latestRankVerification(orderId) })
    },
  })
}

export function useRequestOrderSupport(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => requestOrderSupport(orderId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.orders.supportEscalation(orderId) }),
  })
}

export function useVerifyOrderRank(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => verifyOrderRank(orderId),
    onSuccess: () => {
      invalidateOrder(queryClient, orderId)
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.latestRankVerification(orderId) })
    },
  })
}
